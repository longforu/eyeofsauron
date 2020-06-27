const express = require('express')
const app = new express;

app.use(require('helmet')())
app.use(require('cors')())
app.use(require('body-parser')())
app.use(require('morgan')('common'))
const {scrape} = require('./scrape')
const {titleCase} = require('title-case')

app.post('scrape',async (req,res)=>{
      const {eins} = req.body
      res.send(await scrape(eins))
})

const axios = require('axios')
const url = 'https://projects.propublica.org/nonprofits/api/v2/search.json?q='

const getEINs = async (query)=>{
  const completeURL = `${url}${encodeURI(query.trim())}`
  console.log(completeURL)
  return (await axios.get(completeURL,{}))
  .data.organizations.map(({ein,name})=>({ein,name:titleCase(name.toLowerCase())}))
}

app.set('view engine','pug')
app.set('views','./view')
app.use(express.static('view'))

app.get('/',(req,res)=>res.render('index',{}))

app.get('/search',async (req,res)=>{
  const query = req.query.q
  console.log(query)
  if(!query || query.length < 5 || query.length > 1000) return res.render('index',{search:true,result:[]})
  try{const result = (await getEINs(query)).splice(0,5);return res.render('index',{search:true,result})}catch(e){return res.render('index',{search:true,result:[]})}  
})

app.get('/result',async (req,res)=>{
  const eins = Object.keys(req.query)
  if(!eins.every(e=>parseInt(e))) return res.render('index')
  if(eins.length>5) return res.render('index')
  const [result,totalMoney] = await scrape(eins)
  // console.log(result)
  return res.render('result',{result,totalMoney})
})

const port = process.env.PORT || 4000
app.listen(port)