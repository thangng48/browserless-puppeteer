var fs = require('fs');
const winston = require('winston');
const lineByLine = require('n-readlines');
const puppeteer = require('puppeteer-extra') 
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
var moment = require('moment')

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.simple()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

const Entities = require('html-entities').XmlEntities;
const entities = new Entities();

class EncounterRecaptcha extends Error {  
    constructor (message) {
      super(message)
  
      this.name = this.constructor.name
    }
}

async function run (keywordFile) {
    try{
        puppeteer.use(StealthPlugin())
        logger.info(`Keyword files: ${keywordFile}`);
        let browser = null
        let page = null

        const cleanup = () =>{
            if (browser != null && browser.isConnected()){
                browser.close()
            } 
            if (page != null && page.isClosed()){
                page.close()
            }
        }

        const setup = async () => {
            cleanup()
            browser = await puppeteer.connect({
                browserWSEndpoint: `ws://localhost:3000`        
            });
            page = await browser.newPage();
        }

        await setup()
    
        const liner = new lineByLine(keywordFile);    
        let line;
        let current = 1;
        let keyword;
        while (line = liner.next()) {
            keyword = line.toString();
            try {
                console.log(await browser.userAgent())
                await processPage(page, keyword, current);
            } catch(err){   
                if (err instanceof EncounterRecaptcha){
                    throw err
                }

                logger.error(err);
                try {
                    await setup()
                }catch(err){
                    throw err
                }
                continue
            }
            current++;
        }
        browser.close();
    }catch(err){
        throw err
    }
}

async function processPage(page,keyword, currentIndex){
    let startTime = moment();
    const childLogger = logger.child({ keyword: keyword, "current-index": currentIndex });
    let url = "https://www.google.com/?ql=us&q=" + keyword
    childLogger.info(`Start request to [${url}]`)
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:68.0) Gecko/20100101 Firefox/68.0")
    const response = await page.goto(url, {
        timeout: 30000,
        waitUntil: 'networkidle2',
    });
    const element = await page.waitForSelector('[name="btnK"]');
    await element.click();
    await page.waitForNavigation()

    childLogger.info(`Status code: ${response._status}`);
    let fileName = `${keyword}_${currentIndex}_${response._status}`
    let isRepcaptcha = false
    // await page.waitFor(3000);
    try{
        if (await isRecaptchaPage(page)){
            childLogger.info("Encounter recaptcha")
            fileName = `${keyword}_${currentIndex}_${response._status}_RECAPTCHA`
            isRepcaptcha = true
        }
    }catch(err){
        throw err
    }

    let html = await page.content();
    let content = entities.decode(html);
    fs.writeFile(`html/${fileName}.html`, content, function (err) {
        if (err) {
            childLogger.error("save html failed");
            throw err;
        }
        childLogger.info('Dump content successfully');
    }); 

    try{
        await page.screenshot({path: `screenshot/${fileName}.jpeg`, type:'jpeg', quality: 100, fullPage: true});
        childLogger.info('Screnshot page successfully');
    } catch(err){
        childLogger.error("screenshot failed");
        throw err
    }

    let endTime = moment();
    var secondsDiff = endTime.diff(startTime, 'seconds')
    childLogger.info(`Took ${secondsDiff}s`)

    if (isRepcaptcha){
        throw new EncounterRecaptcha(`${url} is recaptcha`)
    }
}

async function isRecaptchaPage(page){
    const iframe = await page.$("iframe");
    if (iframe == null){
        return false
    }
    const srcProp = await iframe.getProperty('src');
    const src = await srcProp.jsonValue();
    if(src.startsWith("https://www.google.com/recaptcha")){
      return true
    } else{
      return false
    }
}


run("/usr/share/dict/words");
