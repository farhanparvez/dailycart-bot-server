const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

// Render dynamic port
const PORT = process.env.PORT || 3000;

// Firebase key
const serviceAccount = require("./dailycart-8155a-66ae2ca02c84.json");



// Prevent double initialization
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();



// ---------- GOOGLE PRICE SCRAPER ----------

async function getGooglePrice(product) {

  try {

    const url = `https://www.google.com/search?q=${encodeURIComponent(product)}+price+india+kolkata+market+per+kg`;

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const $ = cheerio.load(data);

    let price = null;

    $("span").each((i, el) => {

      const text = $(el).text();
      const number = parseInt(text.replace(/[^0-9]/g, ""));

      if (number && number > 5 && number < 500) {
        price = number;
        return false;
      }

    });

    return price;

  } catch (err) {

    console.log("Google scrape error:", err.message);
    return null;

  }

}


// ---------- PRICE FETCH ----------

async function getPrice(product) {

  const googlePrice = await getGooglePrice(product);

  if (googlePrice) {
    return googlePrice;
  }

  return Math.floor(Math.random() * 80) + 20;

}


// ---------- UPDATE ALL PRODUCTS ----------

async function updatePrices() {

  try {

    const snapshot = await db.collection("products").get();

    for (const doc of snapshot.docs) {

      const data = doc.data();
      const productName = data.name || doc.id;

      const price = await getPrice(productName);

      await db.collection("products").doc(doc.id).update({
        price: price,
        updatedAt: new Date()
      });

      console.log(productName + " updated:", price);

    }

    console.log("All products updated");

  } catch (error) {

    console.error("Update error:", error.message);

  }

}


// ---------- AUTO CREATE PRODUCT ----------

async function findOrCreateProduct(productName) {

  const id = productName.toLowerCase().trim();

  const ref = db.collection("products").doc(id);

  const doc = await ref.get();

  if (!doc.exists) {

    console.log("Creating new product:", productName);

    const price = await getPrice(productName);

    await ref.set({
      name: productName,
      price: price,
      createdAt: new Date()
    });

    return price;

  } else {

    return doc.data().price;

  }

}


// ---------- ROUTES ----------

// manual update
app.get("/update", async (req, res) => {

  try {

    await updatePrices();
    res.send("Prices Updated");

  } catch (err) {

    console.error(err);
    res.status(500).send("Update Error");

  }

});


// product search API
app.get("/product/:name", async (req, res) => {

  try {

    const productName = req.params.name;

    const price = await findOrCreateProduct(productName);

    res.json({
      product: productName,
      price: price
    });

  } catch (err) {

    console.error("Product error:", err.message);
    res.status(500).send("Product Error");

  }

});


// ---------- AUTO UPDATE EVERY 6 HOURS ----------

setInterval(() => {

  console.log("Running auto price update...");

  updatePrices();

}, 6 * 60 * 60 * 1000);


// ---------- START SERVER ----------

app.listen(PORT, () => {

  console.log(`DailyCart Bot Running on port ${PORT}`);

});




