# Understanding GFlowNets

This is a basic implementation of a GFlowNet architecture to get an intuition of how they work and behave.

Training happens in a very simple 2d environment where the reward is given proportional to the mixture of n multivariate Gaussians.

![](https://github.com/florianholeczek/ugfn/blob/master/front/public/images/env1.png)

When the training is successfull we can see that the GFN learned the true underlying distribution:

![](https://github.com/florianholeczek/ugfn/blob/master/front/public/images/run3.png)