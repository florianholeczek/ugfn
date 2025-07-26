# GFlowNet Playground

This repo contains the code for the [GFlowNet Playground](https://gfn-playground.caleydoapp.org), 
an interactive article to learn about [GFlowNets](https://dl.acm.org/doi/abs/10.5555/3648699.3648909) and how to train them.

Here you find the code for the webpage and the Python code to train models using the Playground environment.
The code for the Tetris example can be found [here](https://github.com/Alexander070702/Alexander070702.github.io).

Training in the playground environment happens on a continuous 2d plane where the reward is given proportional to the sum of n multivariate Gaussians.

![](https://github.com/florianholeczek/ugfn/blob/master/front/public/images/env1.png)

When the training is successfull we can see that the GFN learned the true underlying distribution:

![](https://github.com/florianholeczek/ugfn/blob/master/front/public/images/run3.png)

## Python only
If you want to use the Python code, all relevant files are in the "python" folder.
To set up the environment you will need python version >3.8 and <3.11.
It is tested with version [3.10.11](https://www.python.org/downloads/release/python-31011/).
Create a virtual environment using the requirements.txt file:

Windows
```shell
py -m venv venv

# In cmd.exe
venv\Scripts\activate.bat
# Or In PowerShell
venv\Scripts\Activate.ps1

pip install -r requirements.txt
```


Linux:
```shell
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```
If you want to simply train models you can change the hyperparameters at the beginning of 
the python/main.py file to change the model and the environment. 

Then start training with:

```shell
# windows
python python\main.py
# linux
python3 python/main.py
```

## Running the webpage locally
If you want to run the webpage locally you can either use the docker image:
```shell
docker pull florianholeczek/ugfn:latest 
docker run -p 8000:8000 florianholeczek/ugfn:latest
```
Or you build it yourself:
Clone the repository and create a venv like above.

You will need [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) and nodejs. 
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




From the root folder, you can start the page with 
```shell
uvicorn back:app --host 0.0.0.0 --port 8000
```

You can then find it on port 8000:
http://0.0.0.0:8000


