const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

// Render dynamic port
const PORT = process.env.PORT || 3000;

// Firebase key
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);



// Prevent double initialization
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();



// ---------- SMART GOOGLE PRICE SCRAPER ----------

async function getGooglePrice(product) {

try {

const url = `https://www.google.com/search?q=${encodeURIComponent(product)}+mandi+price+kolkata+per+kg`;

const { data } = await axios.get(url, {
headers: { "User-Agent": "Mozilla/5.0" }
});

const $ = cheerio.load(data);

let collectedText = "";

$("div, span").each((i, el) => {

const text = $(el).text();

if(text.includes("₹")){
collectedText += text + "\n";
}

});

// AI analyze
const aiPrice = await analyzePriceWithAI(collectedText);

if(aiPrice){
return aiPrice;
}

return null;

} catch (err) {

console.log("Google scrape error:", err.message);
return null;

}

}
// ---------- AI PRICE ANALYZER ----------

async function analyzePriceWithAI(text){

try{

const response = await axios.post(
"https://api.groq.com/openai/v1/chat/completions",
{
model:"llama-3.1-8b-instant",

messages:[
{
role:"system",
content:"You analyze vegetable market prices. Return only a number."
},
{
role:"user",
content:`Find the realistic vegetable price per kg from this data. Return only number between 10 and 200.

DATA:
${text}`
}
]

},

{
headers:{
"Authorization":`Bearer ${process.env.GROQ_API_KEY}`,
"Content-Type":"application/json"
}
}

)

const result = response.data.choices[0].message.content

return parseInt(result)

}catch(err){

console.log("AI error:",err.message)

return null

}

}

// ---------- PRICE FETCH ----------

async function getPrice(product) {

  const googlePrice = await getGooglePrice(product);

  if (googlePrice) {
    return googlePrice;
  }

  return Math.floor(Math.random() * 80) + 10;

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




