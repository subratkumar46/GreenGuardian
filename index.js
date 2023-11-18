const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const app = express();
const port = 3000;

// ******************static files serving**********************
app.use(express.static(path.join(__dirname, "/public")));

// ******************setting ejs as viewengine**********************
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

app.use(bodyParser.urlencoded({ extended: true }));

// ******************configuring express sessions**********************
app.use(
  session({
    secret: "zxcvbnmtyuiop56789hjk", // Add a secret key for session encryption
    resave: false,
    saveUninitialized: true,
  })
);

// ******************connecting to mongoDB**********************
mongoose.connect("mongodb://localhost:27017/wasteDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ******************creating mongoose model**********************
const User = mongoose.model("User", {
  email: String,
  password: String,
  pin: Number,
  role: String,
  complaints: [
    {
      title: String,
      description: String,
      status: String,
    },
  ],
});

// ******************auth middleware start**********************
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect("/loginForm"); // Redirect to the login form
};
// ******************auth middleware end**********************

// ******************routes**********************

app.get("/", (req, res) => {
  res.render("signForm");
});
app.get("/unauthorized", (req, res) => {
  res.render("error");
});

app.get("/loginForm", function (req, res) {
  res.render("loginForm");
});

app.get("/blogging", isAuthenticated, function (req, res) {
  res.render("blog");
});
app.get("/contact", isAuthenticated, function (req, res) {
  res.render("contact");
});

// Protected routes
app.get("/index", isAuthenticated, (req, res) => {
  res.render("index");
});
app.get("/mcindex", isAuthenticated, (req, res) => {
  if (req.session.user.role === "municipal_corporation") {
    res.render("mcindex");
  } else {
    // Redirect to an unauthorized page for customers
    res.redirect("/unauthorized");
  }
});

app.get("/mcblog", isAuthenticated, (req, res) => {
  // Check if the user has the role "municipal_corporation"
  if (req.session.user.role === "municipal_corporation") {
    res.render("mcblog");
  } else {
    // Redirect to an unauthorized page for customers
    res.redirect("/unauthorized");
  }
});
app.get("/about", isAuthenticated, (req, res) => {
  res.render("about");
});
app.get("/fileComplaint", isAuthenticated, (req, res) => {
  res.render("fileComplaint");
});
// ******************routes end**********************

// *************controllers start*************
app.get("/mccontact", isAuthenticated, (req, res) => {
  if (req.session.user.role === "municipal_corporation") {
    res.render("mccontact");
  } else {
    res.redirect("/unauthorized");
  }
});

app.get("/mccomplaints", isAuthenticated, async (req, res) => {
  if (req.session.user.role === "municipal_corporation") {
    try {
      const userPIN = req.session.user.pin;
      const usersWithComplaints = await User.find(
        { pin: userPIN },
        "complaints"
      );

      const allComplaints = usersWithComplaints.reduce((complaints, user) => {
        return complaints.concat(user.complaints || []);
      }, []);
      console.log(allComplaints);
      res.render("mccomplaints", { allComplaints });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error" });
    }
  } else {
    res.redirect("/unauthorized");
  }
});

app.get("/blog", isAuthenticated, async (req, res) => {
  try {
    const userEmail = req.session.user.email;
    const user = await User.findOne({ email: userEmail });

    if (user) {
      const complaints = user.complaints || [];
      res.render("furniture", { complaints });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Signup route
app.post("/signup", async (req, res) => {
  const { email, password, pin, role } = req.body;

  // Create a new user
  const newUser = new User({
    email,
    password,
    pin,
    role,
  });

  try {
    await newUser.save();
    console.log("New user registered");
    res.redirect("loginForm");
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/signin", async (req, res) => {
  const { email, password, role } = req.body;

  try {
    const user = await User.findOne({ email, password, role });

    if (user) {
      req.session.user = {
        email: user.email,
        role: user.role,
        pin: user.pin,
      };

      if (role == "customer") {
        res.redirect("/index");
      } else {
        res.redirect("/mcindex");
      }
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error signin" });
  }
});

// Register Complain route
app.post("/registerComplain", isAuthenticated, async (req, res) => {
  const { title, description } = req.body;

  try {
    const userEmail = req.session.user.email;
    const user = await User.findOneAndUpdate(
      { email: userEmail },
      {
        $push: {
          complaints: {
            title,
            description,
            status: "submitted",
          },
        },
      },
      { new: true }
    );

    if (user) {
      res.redirect("/fileComplaint"); // Redirect to the complain form or any other page
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update Status route
app.post("/updateStatus", isAuthenticated, async (req, res) => {
  const { status, complaintId } = req.body;

  try {
    const user = await User.findOne({ "complaints._id": complaintId });

    if (!user) {
      return res.status(404).json({ message: "Complaint not found" });
    }
    const complaint = user.complaints.find(
      (c) => c._id.toString() === complaintId
    );

    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }
    complaint.status = status;
    await user.save();

    res.redirect("/mccomplaints");
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/logout", (req, res) => {
  // Destroy the session
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    // Redirect to the login page after destroying the session
    res.redirect("/loginForm");
  });
});


// *************controllers end*************

app.use((req, res) => {
  res.status(404).render("notfound");
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
