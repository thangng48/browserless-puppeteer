#!/bin/bash

hr(){
	printf "%100s\n" " " | tr ' ' '-'
}

swap(){
	hr
	echo "[$(date)] Creating swap"
	sudo fallocate -l 1G /swapfile
	sudo chmod 600 /swapfile
	sudo mkswap /swapfile
	sudo swapon /swapfile
	sudo cp /etc/fstab /etc/fstab.bak
	echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
}

docker(){
	hr
	echo "[$(date)] Start install docker"
	sudo apt-get update
	sudo apt-get install -y \
	    apt-transport-https \
	    ca-certificates \
	    curl \
	    gnupg-agent \
	    software-properties-common
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
	sudo apt-key fingerprint 0EBFCD88
	sudo add-apt-repository \
	    "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
	    $(lsb_release -cs) \
	    stable"
	sudo apt-get update
	sudo apt-get install -y docker-ce docker-ce-cli containerd.io
}


docker_compose(){
	hr
	echo "[$(date)] Start install docker compose"
	sudo curl -L "https://github.com/docker/compose/releases/download/1.25.4/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
	sudo chmod +x /usr/local/bin/docker-compose
}


nodejs(){
	hr
	echo "[$(date)] Start install nodejs"
	curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
	sudo apt install -y nodejs
}

haproxy(){
	hr
	echo "[$(date)] Start install haproxy"
	apt-get install -y haproxy
	sudo cp ./proxies.cfg /etc/haproxy/
	sudo haproxy -f /etc/haproxy/proxies.cfg
}

docker_image(){
	hr
	echo "[$(date)] Start docker image"
	sudo docker run -d -p 3000:3000 -e "MAX_CONCURRENT_SESSIONS=2" -e "PREBOOT_CHROME=true" -e "ENABLE_DEBUGGER=false" --restart always browserless/chrome
	sudo docker run -d -p 6379:6379 redis:latest
}

code_deploy(){
	hr
	echo "[$(date)] Start deploying code"
	mkdir -p $HOME/nodejs/{html,screenshot}
	cp ./google_puppeteer.js $HOME/nodejs
	cp ./package.json $HOME/nodejs
	cp ./words* $HOME/nodejs

	cd  $HOME/nodejs
	npm install
	./start.sh
}

main(){
	swap
	docker
	docker_compose
	nodejs
	haproxy
	docker_image
	code_deploy
}

set -e
echo "[$(date)] Start deploying"
hr
main
