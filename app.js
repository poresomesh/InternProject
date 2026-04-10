
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


const dburl = process.env.ATLASDB_URL;

main()
    .then( ()=> {
        console.log("connection success");
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
  next();
});

 

app.listen(8080 , () =>{
    console.log("port is listing");
});

app.get("/" ,(req , res )=>{
    res.send("Hii Im root");
});



app.get("/demouser", async (req, res) => {
  let fakeUser = {
    email: "student@gmail.com",
    username: "delta-student"
  };

  let registeredUser = await User.register(fakeUser, "helloworld");
  res.send(registeredUser);
});


// app.get("/testListing" , async (req , res ) => {
//     let sampleListing = new Listing ({
//         title : " My new Villa" ,
//         description :  "near forest with full nature vibes..!!" ,
//         price : 1500 ,
//         location : "kerala" ,
//         country : "India"
//     });
//     await sampleListing.save();
//     console.log("data saved..");
//     res.send("successfull testing...");
// });

// index route

app.get("/listings" , async (req , res ) =>{
    const allListings = await Listing.find({});
    res.render("listings/index.ejs" , {allListings});

});

//new route 

app.get("/listings/new" , (req , res )=>{
  if(!req.isAuthenticated()){
    req.flash("error","you must be logged in to create listings...!");
    return res.redirect("/login");
  }
    res.render("listings/new.ejs");
});


//show route

app.get("/listings/:id" , async (req ,res ) => {
    let {id} = req.params;
    const listing = await Listing.findById(id).populate({ path : "reviews" ,
       populate :{path : "author" ,
        } ,
      }).populate("owner");
    if(!listing){
      req.flash("error" , "Listing you requested is not exist");
      req.redirect("/listings");
    }
    console.log(listing);
    res.render("listings/show.ejs" , {listing});
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
         res.redirect("/listings");
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
  res.redirect("/listings");
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
      res.redirect("/listings");
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
      res.redirect("/listings");
});

//logout

// Logout route
app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "Logged out successfully!");
    res.redirect("/listings");
  });
});
