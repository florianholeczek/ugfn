"""
The 2d Mixture of gaussians environment
"""

import torch
from torch.distributions import MultivariateNormal


class Env:
    def __init__(
            self,
            mus=[torch.tensor([1,1]), torch.tensor([-1,-1])],
            sigmas = [torch.ones(2)*0.5]*2,
            start = torch.zeros(2)
    ):
        """
        :param mus: List of Tensors of shape (2) containing the means of the gaussians.
                    All elements must be in the range [-3, 3].
                    Limited to a maximum of 5 gaussians.
        :param sigmas: List of Tensors containing the standard deviation of the gaussians.
                    Right now only shape (2) is supported.
                    #The Tensors can have shape (2) (no covariance) or shape (2,2), representing the covariance matrix.
                    All elements must be in the range [0.1, 1].
                    Limited to a maximum of 5 gaussians.
        :param start: starting point (s_0) for the agent, tensor of shape (2)
        """
        assert len(mus) == len(sigmas), "mus and sigmas have different lengths"
        assert len(mus) <= 5, "maximum of 5 gaussians is allowed"
        assert all([torch.max(torch.abs(m)) <= 3 for m in mus]), "Means must lie in [-3, 3]."
        assert all([torch.max(s)<=1 and torch.min(s)>=0.1 for s in sigmas]), "Sigmas must lie in [0.1, 1]."
        assert torch.max(torch.abs(start)) <= 3, "State must lie in [-3, 3]"

        self.mus = mus
        self.sigmas = [torch.diag(s) for s in sigmas]
        self.mixture = [MultivariateNormal(m,s) for m,s in zip(self.mus, self.sigmas)]
        self.start = start

    def reward(self, state):
        """
        Calculates the reward given a state
        :param state: Tuple or tensor representing the current state
        :return: log reward as a float
        """
        logprobs = [m.log_prob(state) for m in self.mixture]
        reward = torch.sum(torch.exp(torch.stack(logprobs)), dim=0)
        return reward

    def log_reward(self,state):
        """
        Calculates the log reward given a state
        :param state: Tuple representing the current state
        :return: log reward as a float
        """
        logprobs = [m.log_prob(state) for m in self.mixture]
        log_reward = torch.logsumexp(torch.stack(logprobs,0),0)
        return log_reward

    @property
    def log_partition(self):
        """
        Calculates log of the number of gaussians
        :return: log of the number of gaussians
        """
        return torch.tensor(len(self.mus)).log()
