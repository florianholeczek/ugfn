# Understanding GFlowNets

This is a basic implementation of a [GFlowNet](https://dl.acm.org/doi/abs/10.5555/3648699.3648909) architecture to get an intuition of how they work and behave.

Training happens in a very simple 2d environment where the reward is given proportional to the mixture of n multivariate Gaussians.

![](https://github.com/florianholeczek/ugfn/blob/master/front/public/images/env1.png)

When the training is successfull we can see that the GFN learned the true underlying distribution:

![](https://github.com/florianholeczek/ugfn/blob/master/front/public/images/run3.png)

## How to run
The "python" folder contains all python files which are used for training gflownets.
The folder "front" has the data for building the website with svelte.
Dockerimages for the website are here:
https://hub.docker.com/repositories/florianholeczek

To work locally with everything clone the repository first or download and extract the .zip manually

```shell
cd yourworkingdirectory

git clone https://github.com/florianholeczek/ugfn
```

To set up the environment you will need a python version >3.8 and <3.11.

It is tested with version [3.10.11](https://www.python.org/downloads/release/python-31011/).

The following creates a virtual environment:

Windows
```shell
py -m venv venv

# In cmd.exe
venv\Scripts\activate.bat
# Or In PowerShell
venv\Scripts\Activate.ps1

pip install -r python\requirements.txt
```


Linux:
```shell
python3 -m venv venv
source venv/bin/activate
pip install -r python/requirements.txt
```


### Plain python
If you want to simply train models you can change the hyperparameters at the beginning of 
the python/main.py file to change the model and the environment. 

Then start training with:

```shell
# windows
python python\main.py
# linux
python3 python/main.py
```

#### Running the webpage locally
To run the webpage locally you will need [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).
and nodejs. 
Node Version 22.12.0 is tested.

To get it, install nvm via this [link](https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-setup.exe)
or by executing
```shell
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
```

Then execute
```shell
# install nodejs
nvm install 22.12.0
nvm use 22.12.0

# change to the front folder
cd front

# install dependecies
npm install
```




assuming you are already in the back folder, you can start the backend with 
```shell
uvicorn back:app --host 0.0.0.0 --port 8000
```

in a new terminal you can then build the page and run the frontend via
```shell
cd yourworkingdirectory
cd front

npm run build
npm run dev
```
Your frontend should now run on port 8080:
http://localhost:8080


## TODOs
This is still work in progress, ToDos are:
* integrating the Texts in the website
* webpage design
* Visualization for Flow
* Sources
