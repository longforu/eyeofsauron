const axios = require('axios')
const puppeteer = require('puppeteer')
const { parseStringPromise } = require('xml2js')
const fs = require('fs')
const path = require('path')
const {titleCase} = require('title-case')

const xPathDirectory = path.join(__dirname,'./xpath')
const writeFile = (string)=>fs.writeFileSync(xPathDirectory,string,{encoding:'utf-8'})
const readFile = ()=>fs.readFileSync(xPathDirectory,{encoding:'utf-8'})

const xPath = new Map();
const objectschema = new Map()
let xPathLoaded = false
let rawXPathString = ''

const getDataFromString = (obj,string)=>{
      const props = string.split(' ')
      const newObj = (Array.isArray(obj)) ? obj[parseInt(props[0])] : obj[props[0]]
      if(!newObj){
            throw Error
      }
      return (props.length-1) ? getDataFromString(newObj,props.splice(1).join(' ')) : newObj
}

const loadXPath = ()=>{
      rawXPathString = readFile()
      const xpaths = rawXPathString.split(' | ').slice(1).map(e=>e.trim().split('/'))
      xpaths.forEach(path=>{
            const year = path[0]
            xPath.set((year),path[1])
            objectschema.set((year),path[2])
      })
      
}

const addXPath = (year,string,fillingType)=>{
      rawXPathString = `${rawXPathString} | ${year}+${fillingType}/${string}`
      writeFile(rawXPathString)
}

const findObjectSchema = (object)=>{
      let name,amount,cause

      for(let prop in object) 
            if(prop.match(/Name/)) name = prop
            else if(parseInt(object[prop])) amount = prop
            else if(prop.match(/Purpose/)) cause = prop

      const findComprehensive = (obj,prop='')=>{
            if(Array.isArray(obj)) return findComprehensive(obj[0],prop + ' 0')
            if(typeof obj == 'object'){
                  const key = Object.keys(obj)[0]
                  return findComprehensive(obj[key],`${prop} ${key}`)
            }
            return prop
      }
      return `${findComprehensive(object[name],name)}+${findComprehensive(object[amount],amount)}+${findComprehensive(object[cause],cause)}`
}

const findRecipientDataXPathFromXML = (obj,startString = '')=>{
      if(obj.RecipientBusinessName) return `${startString.substring(0,startString.length-2).trim()}/${findObjectSchema(obj)}`
      if(Array.isArray(obj)) return findRecipientDataXPathFromXML(obj[0],startString+' 0')
      else if(typeof obj === 'object') for(let prop in obj){
            const attempt = findRecipientDataXPathFromXML(obj[prop],startString + ` ${prop}`)
            if(attempt) return attempt
      }
      return undefined
}

const addXPathAndSaveToFile = (year,object,fillingType)=>{
      const attemptAutomate = findRecipientDataXPathFromXML(object)
      if(!attemptAutomate){
            console.log(`Attempt to automate for year ${year} and filling type ${fillingType} failed.`)
            return undefined
      }
      const newPath = attemptAutomate.split('/')
      xPath.set(`${year}+${fillingType}`,newPath[0])
      objectschema.set(`${year}+${fillingType}`,newPath[1])
      addXPath(year,newPath.join('/'),fillingType)
      return newPath[0]
}

const getXPath = (year,fillingType)=>{
      if(!xPathLoaded){
            loadXPath()
            xPathLoaded = true
      }
      return xPath.get(`${year}+${fillingType}`)
}

const getObjectSchema = (year,fillingType) => {
      return objectschema.get(`${year}+${fillingType}`)
}

const scrapeFunctionFactory = func => async (...args) => {
      const browser = await puppeteer.launch()
      const page = await browser.newPage()
    
      //Disable extraneous visual element like image or font to decrease load time
      await page.setRequestInterception(true);
      page.on('request', (request) => {
          if (['image', 'stylesheet', 'font', 'script'].indexOf(request.resourceType()) !== -1) return request.abort()
          request.continue()
      });
      
      const result = await func(page,args)
    
      await browser.close()
      return result
    }

const getYear = (link)=>parseInt(link.substring(38,42))-1

const scrapeXML = async (link,fillingType)=>{
      let xml = (await axios.get(link,{
            responseType:'application/xml'
      })).data
      const year = getYear(link)

      try{
            const object = (await parseStringPromise(xml)).Return.ReturnData[0];
            const path = getXPath(year,fillingType) || addXPathAndSaveToFile(year,object,fillingType)
            if(!path) return undefined
            var uncleanData = getDataFromString(object,path)
            var [name,amount,cause] = getObjectSchema(year,fillingType).split('+')
            
      } catch(e){console.log(e,year)}
      const cleanData = []
      // console.log(uncleanData)
      console.log(uncleanData.length)
      for(let e of uncleanData){
            try{
                  cleanData.push({
                        name:titleCase(getDataFromString(e,name).toLowerCase()),
                        amount:parseInt(getDataFromString(e,amount)),
                        description:titleCase(getDataFromString(e,cause).toLowerCase()),
                        year,
                  })
            }
            catch(error){console.log(e,error);continue;}
      }
      const total = cleanData.reduce((total,e)=>total+e.amount,0) || 0
      return [cleanData,total]
}

const fileDirectory = path.join(__dirname,'./cache')

const getFileDirectory = (ein)=>path.join(fileDirectory,`${ein}.json`)
const EINCacheExist = (ein)=>fs.existsSync(getFileDirectory(ein))
const writeEINCache = (ein,object)=>fs.writeFileSync(getFileDirectory(ein),JSON.stringify(object))
const readEINCache = (ein)=>JSON.parse(fs.readFileSync(getFileDirectory(ein),{encoding:'utf-8'}))

const scrapeEIN = scrapeFunctionFactory( async (page,ein)=>{
      const url = `https://projects.propublica.org/nonprofits/organizations/${ein}`
      await page.goto(url)
      try{
            const links = await page.$$eval('.xml',(elem)=>elem.map(e=>e.href).filter(e=>e))
            const fillingType = await page.$eval('.xml',(elem)=>elem.innerHTML)
            const foundationName = await page.$eval('title',elem=>elem.innerHTML.split(' - ')[0])
            return [links,foundationName,fillingType];
      }
      catch(e){
            return [[]]
      }
})

const scraping = new Map()

const scrapeSingleEIN = async (ein)=>{
      console.log('called')
      console.log(scraping)
      if(EINCacheExist(ein)) return readEINCache(ein)
      if(scraping.has(ein)) return new Promise(r=>scraping.set(ein,[r,...scraping.get(ein)]))
      scraping.set(ein,[])     
      const [links,foundation,fillingType] = await scrapeEIN(ein)
      const result = []
      let totalMoney = 0
      for(let link of links){
            try{
                  const [content,total] = await scrapeXML(link,fillingType) || []
                  if(total) totalMoney += total
                  result.push((content || []).filter(e=>e).map(e=>({...e,foundation})))
            }
            catch(e){
                  console.log(links)
            }
      }
      writeEINCache(ein,[result,totalMoney])
      scraping.get(ein).forEach(f=>f(result))
      scraping.delete(ein)
      return [result,totalMoney]
}

const scrape = async(eins)=>{
      let result = []
      let totalMoney = 0
      for(let ein of eins){
            try{
                  const [scrapeAttempt,money] = await scrapeSingleEIN(ein)
                  if(money) totalMoney+=money
                  result = [...result,scrapeAttempt]
            }
            catch(e){
                  console.log(ein)
                  scraping.get(ein).forEach(e=>e([])) && scraping.delete(ein);
                  console.log(e);
                  continue;
            }
      }
      return [result.flat(2).sort((a,b)=>b.year - a.year),totalMoney]
}
module.exports = {scrape}
