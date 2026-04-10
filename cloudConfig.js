require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET,
});

// Multer storage setup
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "wanderlust_uploads",
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

module.exports={cloudinary,storage}