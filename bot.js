const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer")

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
   CLEAN PRODUCT NAME
========================= */

function cleanProductName(name){

return name
.toLowerCase()
.replace(/[^a-z ]/g,"")
.trim()

}



/* =========================
   GOOGLE SCRAPER
========================= */


async function getGoogleData(product){

try{

const clean = product
.toLowerCase()
.replace(/[^a-z ]/g,"")
.trim()

const browser = await puppeteer.launch({
headless:true,
args:["--no-sandbox","--disable-setuid-sandbox"]
})

const page = await browser.newPage()

await page.setUserAgent(
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
)

const searchUrl =
`https://www.google.com/search?q=${encodeURIComponent(clean+" price per kg kolkata")}`

await page.goto(searchUrl,{waitUntil:"networkidle2"})

await page.waitForTimeout(3000)

const text = await page.evaluate(()=>{

let collected=""

document.querySelectorAll("div,span").forEach(el=>{

const t = el.innerText

if(t && t.includes("₹")){
collected += t + "\n"
}

})

return collected

})

await browser.close()

console.log("SCRAPED DATA:\n",text)

return text

}catch(err){

console.log("Puppeteer scrape error:",err.message)

return ""

}

}


/* =========================
   AI PRICE ANALYZER
========================= */

async function analyzePriceWithAI(text){

try{

if(!text || text.length < 5){
return null
}

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
content:`Find realistic vegetable price per kg between 10 and 200.

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

console.log("AI RESPONSE:",result)

const number = parseInt(result)

if(number && number > 5 && number < 300){
return number
}

return null

}catch(err){

console.log("AI error:",err.message)

return null

}

}



/* =========================
   FINAL PRICE SYSTEM
========================= */

async function getPrice(product){

try{

const googleData = await getGoogleData(product)

const aiPrice = await analyzePriceWithAI(googleData)

if(aiPrice){
console.log("FINAL AI PRICE:",aiPrice)
return aiPrice
}

return 30

}catch(err){

console.log("Price error:",err.message)
return 30

}

}



/* =========================
   UPDATE ALL PRODUCTS
========================= */

async function updatePrices(){

try{

const snapshot = await db.collection("products").get()

for(const doc of snapshot.docs){

const productName = doc.data().name || doc.id

const price = await getPrice(productName)

console.log("UPDATING:",productName,price)

await db.collection("products").doc(doc.id).update({
price:price,
updatedAt:new Date()
})

}

console.log("ALL PRODUCTS UPDATED")

}catch(err){

console.log("Update error:",err.message)

}

}



/* =========================
   PRODUCT SEARCH
========================= */

async function findOrCreateProduct(productName){

const id = cleanProductName(productName)

const ref = db.collection("products").doc(id)

const doc = await ref.get()

if(!doc.exists){

console.log("Creating product:",productName)

const price = await getPrice(productName)

await ref.set({
name:productName,
price:price,
createdAt:new Date()
})

return price

}else{

const newPrice = await getPrice(productName)

await ref.update({
price:newPrice,
updatedAt:new Date()
})

return newPrice

}

}



/* =========================
   TEST ROUTE
========================= */

app.get("/ai-test/:name", async (req,res)=>{

const product = req.params.name

const googleData = await getGoogleData(product)

const aiPrice = await analyzePriceWithAI(googleData)

res.json({
product:product,
scrapedData:googleData,
aiPrice:aiPrice
})

})



/* =========================
   PRODUCT API
========================= */

app.get("/product/:name", async (req,res)=>{

try{

const productName = req.params.name

const price = await findOrCreateProduct(productName)

res.json({
product:productName,
price:price
})

}catch(err){

res.status(500).send("Product Error")

}

})



/* =========================
   MANUAL UPDATE
========================= */

app.get("/update", async(req,res)=>{

await updatePrices()

res.send("Prices Updated")

})



/* =========================
   AUTO UPDATE
========================= */

setInterval(()=>{

console.log("AUTO UPDATE RUNNING")

updatePrices()

},6*60*60*1000)



/* =========================
   START SERVER
========================= */

app.listen(PORT,()=>{

console.log("DailyCart Bot Running")

})


