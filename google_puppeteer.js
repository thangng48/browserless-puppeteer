var fs = require('fs');
const winston = require('winston');
const lineByLine = require('n-readlines');
const puppeteer = require('puppeteer-extra') 
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
var moment = require('moment')
var sleep = require('sleep');

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
const Queue = require('bull');
const KeywordQueue = new Queue('keyword');

class EncounterRecaptcha extends Error {  
    constructor (message) {
      super(message)
  
      this.name = this.constructor.name
    }
}

function getKeywordBulk(iterator, size=100) {
    var bulk = []
    let line;
    let index = 0
    let endOfIterator = true
    let keyword;
    while(line = iterator.next()){
        keyword = line.toString()
        bulk.push(keyword)
        index++
        if(index > size){
            endOfIterator = false
            break
        }
    }
    return {bulkKeyword: bulk, endOfIterator: endOfIterator}
}

async function run (keywordFile) {
    let liner = new lineByLine(keywordFile)
    queueConsumer()
    queueProducer(liner)
}

async function queueProducer(keywordIterator){
    let line
    let keyword
    let keywordIndex = 1

    while(line = keywordIterator.next()){
        let count = await KeywordQueue.count()
        if (count > 10){
            logger.info(`Number of job: ${count}. Sleep 5s.`)
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        keyword = line.toString()

        KeywordQueue.add({
            keyword: keyword,
            index: keywordIndex,
            pageIndex: 0
        })
        keywordIndex++
    }
}

async function queueConsumer(){
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

    await KeywordQueue.process(async function(job, done){
        let {keyword, index, pageIndex} = job.data
        try{
            await processKeyword(page, keyword, index, pageIndex)
            if (pageIndex < 10){
                await KeywordQueue.add({
                    keyword: keyword,
                    index: index,
                    pageIndex: pageIndex+1
                })
            }
        }catch(err){
            logger.error(err)
            await KeywordQueue.add({
                keyword: keyword,
                index: index,
                pageIndex: pageIndex
            })
            try{
                await setup()
            }catch(err){
                logger.error(err)
            }
        }finally{
            done();
        }
    })
}


async function saveSearchResultPage(page, response, keyword, currentIndex, pageIndex, logger, takeScreenshot){
    let childLogger = logger.child({ pageIndex: pageIndex})
    let fileName = `${keyword}_${pageIndex}_${currentIndex}_${response._status}`
    let isRepcaptcha = false
    try{
        if (await isRecaptchaPage(page)){
            childLogger.info("Encounter recaptcha")
            fileName = `${fileName}_RECAPTCHA`
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

    if (takeScreenshot){
        try{
            await page.screenshot({path: `screenshot/${fileName}.jpeg`, type:'jpeg', quality: 10, fullPage: true});
            childLogger.info('Screnshot page successfully');
        } catch(err){
            childLogger.error("screenshot failed");
            throw err
        }
    }

    if (isRepcaptcha){
        throw new EncounterRecaptcha(`${url} is recaptcha`)
    }
}

async function processKeyword(page, keyword, keywordIndex, pageIndex){
    let startTime = moment();
    let takeScreenshot = process.env.PUPPETEER_TAKE_SCREENSHOT == 'true'
    const childLogger = logger.child({ keyword: keyword, "current-index": keywordIndex });
    let url = `https://www.google.com/?ql=us&q=${keyword}&start=${pageIndex*10}`
    childLogger.info(`Start request to [${url}]`)
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:68.0) Gecko/20100101 Firefox/68.0")
    const response = await page.goto(url, {
        timeout: 30000,
        waitUntil: 'networkidle2',
    });
    const element = await page.waitForSelector('[name="btnK"]');
    await element.click();
    await page.waitForNavigation()
    if (pageIndex > 0){
        const element = await page.waitForSelector(`[aria-label="Page ${pageIndex+1}"]`);
        await element.click();
        await page.waitForNavigation()
    }
    await saveSearchResultPage(page, response, keyword, keywordIndex, pageIndex, childLogger, takeScreenshot)

    let endTime = moment();
    var secondsDiff = endTime.diff(startTime, 'seconds')
    childLogger.info(`Took ${secondsDiff}s`)
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


//run("/usr/share/dict/words");
run(process.argv[2])
