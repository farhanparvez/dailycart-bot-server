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



/* =========================
   GOOGLE SCRAPER
========================= */

async function getGooglePrice(product){

try{

const url = `https://www.google.com/search?q=${encodeURIComponent(product)}+mandi+price+kolkata+per+kg`;

const {data} = await axios.get(url,{
headers:{ "User-Agent":"Mozilla/5.0" }
});

const $ = cheerio.load(data);

let collectedText = "";

$("div,span").each((i,el)=>{

const text = $(el).text();

if(text.includes("₹")){
collectedText += text + "\n";
}

});

console.log("SCRAPED TEXT:");
console.log(collectedText);


/* AI ANALYZE */

const aiPrice = await analyzePriceWithAI(collectedText);

console.log("AI PRICE RESULT:", aiPrice);

if(aiPrice){
return aiPrice;
}

return null;

}catch(err){

console.log("Google scrape error:",err.message);

return null;

}

}



/* =========================
   AI ANALYZER
========================= */

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

const result = response.data.choices[0].message.content;

console.log("AI RAW RESPONSE:", result);

return parseInt(result);

}catch(err){

console.log("AI error:",err.message);

return null;

}

}



/* =========================
   PRICE FETCH
========================= */

async function getPrice(product){

const price = await getGooglePrice(product);

if(price){
return price;
}

return 30;

}



/* =========================
   UPDATE ALL PRODUCTS
========================= */

async function updatePrices(){

try{

const snapshot = await db.collection("products").get();

for(const doc of snapshot.docs){

const data = doc.data();

const productName = data.name || doc.id;

const price = await getPrice(productName);

console.log("UPDATING:",productName,"PRICE:",price);

await db.collection("products").doc(doc.id).update({
price:price,
updatedAt:new Date()
});

}

console.log("ALL PRODUCTS UPDATED");

}catch(err){

console.log("Update error:",err.message);

}

}



/* =========================
   PRODUCT SEARCH
========================= */

async function findOrCreateProduct(productName){

const id = productName.toLowerCase().trim();

const ref = db.collection("products").doc(id);

const doc = await ref.get();

if(!doc.exists){

console.log("Creating new product:",productName);

const price = await getPrice(productName);

await ref.set({
name:productName,
price:price,
createdAt:new Date()
});

return price;

}else{

return doc.data().price;

}

}



/* =========================
   TEST ROUTES
========================= */


/* AI TEST */
app.get("/ai-test/:name", async (req,res)=>{

const product = req.params.name;

const url = `https://www.google.com/search?q=${encodeURIComponent(product)}+price+per+kg`;

const {data} = await axios.get(url,{
headers:{ "User-Agent":"Mozilla/5.0" }
});

const $ = cheerio.load(data);

let collectedText="";

$("div,span").each((i,el)=>{

const text=$(el).text();

if(text.includes("₹")){
collectedText+=text+"\n";
}

});

const aiPrice = await analyzePriceWithAI(collectedText);

res.json({
product:product,
aiPrice:aiPrice,
scrapedData:collectedText
});

});



/* NORMAL PRODUCT API */
app.get("/product/:name", async (req,res)=>{

try{

const productName=req.params.name;

const price=await findOrCreateProduct(productName);

res.json({
product:productName,
price:price
});

}catch(err){

res.status(500).send("Product Error");

}

});


/* MANUAL UPDATE */
app.get("/update",async(req,res)=>{

await updatePrices();

res.send("Prices Updated");

});



/* =========================
   AUTO UPDATE
========================= */

setInterval(()=>{

console.log("AUTO UPDATE RUNNING");

updatePrices();

},6*60*60*1000);



/* =========================
   START SERVER
========================= */

app.listen(PORT,()=>{

console.log("DailyCart Bot Running");

});



