#!/bin/bash

#export PUPPETEER_TAKE_SCREENSHOT=true
ip=`ip a | grep inet | grep "/20" | awk -F/ '{print $1}' | awk '{print $2}'`
export PUPPETEER_PROXY=http://${ip}:3128
ps -ef | grep "google_puppeteer.js" | awk '{print $2}' | xargs kill -9

node google_puppeteer.js words.10000 > log.1 2>&1 &
node google_puppeteer.js words.last.10000 >> log.2 2>&1 &
node google_puppeteer.js words.20000.30000 >> log.3 2>&1 &

disown
