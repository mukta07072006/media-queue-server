const express = require("express")
const app = express()
const port = 4500


app.get('/', (req, res)=>{
    res.send("Server is running!")
})

app.listen(port, ()=>{
    console.log(`Everyithing going fine at ${port}`)
})