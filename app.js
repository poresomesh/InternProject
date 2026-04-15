
if(process.env.NODE_ENV !=="production"){
  require('dotenv').config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const Review = require("./models/review.js");
const session = require("express-session");
const MongoStore = require('connect-mongo');
const flash = require("connect-flash");

const passport = require("passport");
const LocalStrategy = require("passport-local");
 
const User = require("./models/user.js");
const multer  = require('multer');
const {storage} =require("./cloudConfig.js");
const { url } = require('inspector');
const upload = multer({ storage });

const Booking = require("./models/booking.js");


const dburl = process.env.ATLASDB_URL;

main()
    .then( ()=> {
        console.log("connection success");

        app.listen(8080 , () =>{
        console.log("port is listing");
        });
    })
    .catch(err => console.log(err));

async function main() {
  await mongoose.connect(dburl);

}

app.set("view engine" , "ejs");
app.set("views" , path.join(__dirname , "views"));
app.use(express.urlencoded({extended : true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.engine("ejs" , ejsMate);
app.use(express.static(path.join(__dirname , "/public")));


app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());




app.use(flash());

// Make flash messages available in all templates
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;

  res.locals.currPath = req.path;
  
  next();
});

 




app.get("/demouser", async (req, res) => {
  let fakeUser = {
    email: "student@gmail.com",
    username: "delta-student"
  };

  let registeredUser = await User.register(fakeUser, "helloworld");
  res.send(registeredUser);
});

// index route

// INDEX ROUTE
app.get("/", async (req, res) => {
    let { category } = req.query;
    let allListings;
    if (category) {
        allListings = await Listing.find({ category: category });
    } else {
        allListings = await Listing.find({});
    }
    // Use currPath here
    res.render("listings/index.ejs", { allListings, currPath: "/" });
});
//new route 

app.get("/listings/new" , (req , res )=>{
    
  if(!req.isAuthenticated()){
    req.flash("error","you must be logged in to create listings...!");
    return res.redirect("/login");
  }
  
    res.render("listings/new.ejs" , { currPath: "new_listing" });
});


//show route


//UPDATE your existing Show Route to include bookings
app.get("/listings/:id", async (req, res, next) => {
    let { id } = req.params;

    // 1. Skip this route if the ID is just the word "search"
    if (id === "search") {
        return next(); 
    }

    // 2. Validate the ID format
    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "Invalid Listing ID!");
        return res.redirect("/");
    }

    try {
        // 3. Populate listing, reviews, and authors
        const listing = await Listing.findById(id)
            .populate({
                path: "reviews",
                populate: { path: "author" },
            })
            .populate("owner");

        if (!listing) {
            req.flash("error", "Listing you requested for does not exist!");
            return res.redirect("/");
        }

        // 4. Booking Dates logic (Crucial for your calendar)
        const bookings = await Booking.find({ listing: id });
        let bookedDates = [];
        bookings.forEach(b => {
            let current = new Date(b.checkIn);
            while (current < b.checkOut) {
                bookedDates.push(current.toISOString().split('T')[0]);
                current.setDate(current.getDate() + 1);
            }
        });

        // 5. Render with all data
        res.render("listings/show.ejs", { 
            listing, 
            bookedDates: JSON.stringify(bookedDates),
            currPath: req.path // Explicitly passing this ensures navbar works
        });

    } catch (err) {
        console.error(err);
        req.flash("error", "Something went wrong!");
        res.redirect("/");
    }
});

// 3. ADD this new POST route for handling the booking
app.post("/listings/:id/book", async (req, res) => {
    if (!req.isAuthenticated()) {
        req.flash("error", "You must be logged in to book!");
        return res.redirect("/login");
    }

    let { id } = req.params;
    let { checkIn, checkOut } = req.body;
    const requestedIn = new Date(checkIn);
    const requestedOut = new Date(checkOut);

    if (requestedIn >= requestedOut) {
        req.flash("error", "Check-out must be after check-in!");
        return res.redirect(`/listings/${id}`);
    }

    try {
        // Check if any existing booking overlaps with these dates
        const overlap = await Booking.findOne({
            listing: id,
            checkIn: { $lt: requestedOut }, 
            checkOut: { $gt: requestedIn }
        });

        if (overlap) {
            req.flash("error", "These dates are already taken. Please check the 'Already Booked' list below.");
            return res.redirect(`/listings/${id}`);
        }

        const newBooking = new Booking({
            listing: id,
            user: req.user._id,
            checkIn: requestedIn,
            checkOut: requestedOut
        });

        await newBooking.save();
        req.flash("success", "Hotel booked successfully!");
        res.redirect(`/listings/${id}`);
    } catch (err) {
        req.flash("error", "Server error. Please try again.");
        res.redirect(`/listings/${id}`);
    }
});
//create route 

app.post("/listings", upload.single("listing[image]"), async (req, res, next) => {
    try{
         const newListings = new Listing(req.body.listing);
         newListings.owner = req.user._id;

         if(req.file){
          newListings.image = {url : req.file.path , filename : req.file.filename};
         }

         await newListings.save();
         res.redirect("/");
    }catch(err){
        next(err);
    };
   
});

//edit route 

app.get("/listings/:id/edit" , async (req ,res ) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);

    let originalImageUrl = listing.image.url;
    originalImageUrl = originalImageUrl.replace("/uploaad" , "/upload/h_50,w_50");
    res.render("listings/edit.ejs" , {listing , originalImageUrl});
});

// Update Route
app.put("/listings/:id", upload.single("listing[image]"), async (req, res) => {
    let { id } = req.params;
    
    // 1. Update the text fields (title, description, price, etc.)
    let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });

    // 2. If a new file is uploaded, update the image field
    if (typeof req.file !== "undefined") {
        let url = req.file.path;
        let filename = req.file.filename;
        listing.image = { url, filename };
        await listing.save();
    }

    res.redirect(`/listings/${id}`);
});

//Delete Route
app.delete("/listings/:id", async (req, res) => {
  let { id } = req.params;
  let deletedListing = await Listing.findByIdAndDelete(id);
  console.log(deletedListing);
  res.redirect("/");
});

//Reviews 
app.post("/listings/:id/reviews" , async(req , res)=>{
    const listing = await Listing.findById(req.params.id);
    let newReview = new Review(req.body.review);
    newReview.author = req.user._id;
    console.log(newReview);
    listing.reviews.push(newReview);
    await newReview.save();
    await listing.save();

    res.redirect(`/listings/${listing._id}`)
})

//Delete Route
app.delete("/listings/:id/reviews/:reviewId" , async(req , res )=>{
    let {id , reviewId } = req.params;
    await Listing.findByIdAndUpdate(id , {$pull : {reviews : reviewId}});
    await Review.findByIdAndDelete(reviewId);
    res.redirect(`/listings/${id}`);
})

// app.use( (err ,req , res , next) =>{
//     res.send("Something went wrong..!");
// });

//user route

//sign up

app.get("/signup", (req, res) => {
  res.render("users/signup.ejs");
});

app.post("/signup", async (req, res) => {
  try {
    let { username, email, password } = req.body;
    const newUser = new User({ username, email });
    const registeredUser = await User.register(newUser, password);
    console.log(registeredUser);
    req.login(registeredUser, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success", "Welcome to WanderLust!");
      res.redirect("/");
    });
  }catch (e) {
    req.flash("error", e.message);
    res.redirect("/signup");
  }
});

//login

app.get("/login" , (req , res)=> {
  res.render("users/login.ejs");
});

app.post("/login" , passport.authenticate("local" ,
    {failureRedirect : `/login` , failureFlash: true}),
    async(req ,res)=>{
      req.flash("success","Welcome back to wanderlust...!");
      res.redirect("/");
});

//logout

// Logout route
app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "Logged out successfully!");
    res.redirect("/");
  });
});



//BOOKING Route
app.post("/listings/:id/book", async (req, res) => {
    if (!req.isAuthenticated()) {
        req.flash("error", "Please login to book!");
        return res.redirect("/login");
    }

    const { id } = req.params;
    const { checkIn, checkOut } = req.body;

    // Convert strings from form into actual JS Date Objects
    const requestedCheckIn = new Date(checkIn);
    const requestedCheckOut = new Date(checkOut);

    try {
        // 1. Find ANY booking for THIS hotel where dates overlap
        // Logic: A booking overlaps if (NewIn < ExistingOut) AND (NewOut > ExistingIn)
        const overlap = await Booking.findOne({
            listing: id,
            checkIn: { $lt: requestedCheckOut }, 
            checkOut: { $gt: requestedCheckIn }
        });

        if (overlap) {
            req.flash("error", "These dates are already booked! Try different dates.");
            return res.redirect(`/listings/${id}`);
        }

        // 2. If no overlap, create the booking
        const newBooking = new Booking({
            listing: id,
            user: req.user._id,
            checkIn: requestedCheckIn,
            checkOut: requestedCheckOut
        });

        await newBooking.save();
        req.flash("success", "Booking confirmed!");
        res.redirect(`/listings/${id}`);

    } catch (err) {
        console.error(err);
        req.flash("error", "Booking failed due to a server error.");
        res.redirect(`/listings/${id}`);
    }
});

// --- UPDATED BOOKING ROUTE WITH AVAILABILITY CHECK ---
app.post("/listings/:id/book", async (req, res) => {
    if (!req.isAuthenticated()) {
        req.flash("error", "You must be logged in to book!");
        return res.redirect("/login");
    }

    let { id } = req.params;
    let { checkIn, checkOut } = req.body;

    const newIn = new Date(checkIn);
    const newOut = new Date(checkOut);

    // 1. Basic Date Validation
    if (!checkIn || !checkOut || newIn >= newOut) {
        req.flash("error", "Invalid dates! Check-out must be after check-in.");
        return res.redirect(`/listings/${id}`);
    }

    try {
        // 2. AVAILABILITY LOGIC: Find overlapping bookings for THIS listing
        const existingBookings = await Booking.find({
            listing: id,
            $or: [
                {
                    checkIn: { $lt: newOut },
                    checkOut: { $gt: newIn }
                }
            ]
        });

        // 3. If any booking exists in that range, block the request
        if (existingBookings.length > 0) {
            req.flash("error", "Sorry, this hotel is already booked for the selected dates!");
            return res.redirect(`/listings/${id}`);
        }

        // 4. If free, save the booking
        const newBooking = new Booking({
            listing: id,
            user: req.user._id,
            checkIn: newIn,
            checkOut: newOut
        });

        await newBooking.save();
        req.flash("success", "Booking confirmed! Your dates are locked in.");
        res.redirect(`/listings/${id}`);

    } catch (err) {
        console.error("Booking Error:", err);
        req.flash("error", "Internal Server Error.");
        res.redirect(`/listings/${id}`);
    }
});



// 1. SEARCH (MUST be above :id)
app.get("/listings/search", async (req, res) => {
    let { title } = req.query;
    const allListings = await Listing.find({ title: { $regex: title, $options: "i" } });
    res.render("listings/index.ejs", { allListings });
});

// 2. NEW (To create a new listing)
app.get("/listings/new", (req, res) => {
    res.render("listings/new.ejs");
});

// 3. SHOW (The :id route is a "catch-all", it must stay below specific words)
app.get("/listings/:id", async (req, res) => {
    let { id } = req.params;
    try {
        const listing = await Listing.findById(id).populate("reviews").populate("owner");
        const bookings = await Booking.find({ listing: id });
        
        // ... (your existing bookedDates logic) ...

        res.render("listings/show.ejs", { listing, bookedDates: JSON.stringify(bookedDates) });
    } catch (err) {
        // If someone types a wrong ID manually, this prevents the crash
        req.flash("error", "Invalid ID format!");
        res.redirect("/listings");
    }
});

// 4. BOOKING POST (Make sure this matches your form action)
app.post("/listings/:id/book", async (req, res) => {
    // ... your booking logic ...
});