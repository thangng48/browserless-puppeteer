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


class SetupPuppterError extends Error {  
    constructor (message) {
      super(message)
  
      this.name = this.constructor.name
    }
}
  

async function run (keywordFile) {
    try{
        puppeteer.use(StealthPlugin())
        // console.log("Keyword files: ",keywordFile);
        logger.info(`Keyword files: ${keywordFile}`);
        let browser = null
        let page = null
        const setup = async () => {
            if (browser != null){
                browser.close()
            } 
            if (page != null){
                page.close()
            }
            browser = await puppeteer.connect({
                browserWSEndpoint: `ws://localhost:3000`        
            });
            page = await browser.newPage();
        };
        await setup()
    
        const liner = new lineByLine(keywordFile);    
        let line;
        let current = 1;
        let keyword;
        while (line = liner.next()) {
            keyword = line.toString();
            try {
                await processPage(page, keyword, current);
            } catch(err){
                logger.error(err);
                try {
                    await setup()
                }catch(err){
                    throw new SetupPuppterError(err)
                }
                continue
            }
            current++;
        }
        browser.close();
    }catch(e){
        logger.error(e)
    }
}

async function processPage(page,keyword, currentIndex){
    let startTime = moment();
    const childLogger = logger.child({ keyword: keyword, "current-index": currentIndex });
    let url = "https://www.google.com/search?q=" + keyword
    childLogger.info(`Start request to [${url}]`)
    const response = await page.goto(url, {
        timeout: 30000,
        waitUntil: 'networkidle2',
    });
  
    let fileName = `${keyword}_${currentIndex}_${response._status}`
    await page.waitFor(3000);
    let html = await page.content();
    let content = entities.decode(html);
    fs.writeFile(`html/${fileName}.html`, content, function (err) {
        if (err) throw err;
        childLogger.info('Dump content successfully');
    });

    await page.screenshot({path: `screenshot/${fileName}.png`, fullPage: true});
    childLogger.info('Screnshot page successfully');
    let endTime = moment();
    var secondsDiff = endTime.diff(startTime, 'seconds')
    childLogger.info(`Took ${secondsDiff}s`)
}


run("/usr/share/dict/words");