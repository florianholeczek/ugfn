
//getting the ml part in the frontend (work in progress)
export let tf = null;

if (window.tf) {
    tf = window.tf;
} else {
    window.addEventListener("load", () => {
        if (window.tf) {
            tf = window.tf;
            tf.setBackend("cpu");
        }
    });
}

export class MultivariateNormal{
    constructor(
        mus,
        sigmas
    ){
        /**
         * As tensorflow.js does not support Multivariate Normal distributions this is a helper class
         * It is limited to the case where the covariance matrix is defined by \sigma I,
         * e.g. no covariance and identical variance for all dimensions.
         * @param {tf.tensor} mus - A tensor of shape (batchsize,2) representing mu_x, mu_y.
         * @param {tf.tensor} sigmas - A tensor of shape(batchsize,1) representing sigma
         */

        this.mus = mus
        this.sigmas = sigmas
    }

    sample(){
        let samples_raw = tf.randomNormal(this.mus.shape, 0,1);
        let samples_scaled = samples_raw.mul(this.sigmas);
        let samples = samples_scaled.add(this.mus);
        return samples;
    }

    log_prob(samples) {
        // TODO needs checking
        console.log("lp 1")
        const d = this.mus.shape[1];  // Number of dimensions (should be 2 for 2D)
        const log2pi = tf.scalar(Math.log(2 * Math.PI));
        // Compute (x - mu) / sigma for each sample
        const diff = samples.sub(this.mus);
        const diff_scaled = diff.div(this.sigmas);
        // Compute the squared term (x - mu)^2 / sigma^2
        const squared_term = diff_scaled.square();
        // Sum over the dimensions (axis 1)
        const sum_squared = squared_term.sum(1);
        // Log probability calculation: log p(x) = -d/2 * log(2*pi) - sum(log(sigma)) - 1/2 * sum((x - mu)^2 / sigma^2)
        const log_sigma = tf.log(this.sigmas);
        const log_prob = tf.neg(
            tf.mul(
                tf.scalar(d / 2).mul(log2pi),
                tf.scalar(1)
            )
        ).sub(log_sigma.sum(1))
          .sub(sum_squared.mul(tf.scalar(0.5)));

        return log_prob;
    }



}


export class GFlowNet{
    constructor(
        n_hidden_layers=2,
        hidden_dim=64,
        lr_model=1e-3,
        lr_logz=1e-1,
    ){
        /**
         * A GFlowNet class.
         * @param {number} nHiddenLayers - Number of hidden layers.
         * @param {number} hiddenDim - Number of hidden units.
         * @param {number} lrModel - Learning rate of the model.
         * @param {number} lrLogZ - Learning rate of logZ.
         */
        tf.setBackend("cpu")
        this.forward_model = this.createModel(n_hidden_layers, hidden_dim);
        this.backward_model = this.createModel(n_hidden_layers, hidden_dim);
        this.logz = tf.variable(tf.scalar(0.0));
        this.optimizer_logz = tf.train.adam(lr_logz)
        this.optimizer_model = tf.train.adam(lr_model)
    };

    createModel(nHiddenLayers, hiddenDim) {
        const model = tf.sequential();
        model.add(tf.layers.dense({ inputShape: [3], units: hiddenDim, activation: 'elu' }));
        for (let i = 0; i < nHiddenLayers; i++) {
            model.add(tf.layers.dense({ units: hiddenDim, activation: 'elu' }));
        }
        model.add(tf.layers.dense({ units: 3 }));
        return model;
    }

    init_state(env, batch_size){
        /**
         * Initializes s_0
         * @param {Object} env - The environment to train in.
         * @param {number} batch_size - The batch size.
         * @returns {tf.Tensor} - Initialized state, a tensor of shape (batch_size, 3)
         *                        where each state consists of [step, x, y].
         */
        const x = tf.tidy(() =>{
            let a = tf.zeros([batch_size,1]); //state counter starts with 0
            let b = env.start.reshape([1,2]); // start state
            let c = tf.tile(b, [batch_size,1]);
            return tf.concat([a,c],1) //tensor of shape (batch_size, 3) with each state (step,x,y)
        });
        return x;
    }

    static step(x, action) {
        /**
         * Taking a step in the environment
         * @param {tf.Tensor} x - Batch of states (shape: [batch_size, 3])
         * @param {tf.Tensor} action - Action to take (shape: [batch_size, 2])
         * @return {tf.Tensor} - Batch of new states
         */
        return tf.tidy(() => {
            const stepIncrease = tf.onesLike(x.slice([0, 0], [-1, 1]));
            const newPos = x.slice([0, 1], [-1, 2]).add(action);
            return tf.concat([x.slice([0, 0], [-1, 1]).add(stepIncrease), newPos], 1);
        });



        /*
        let x_new = tf.tidy(() => {
            let updatedState = x.slice([0, 1], [-1, 2]).add(action); // x[:,1:] + action
            let updatedTime = x.slice([0, 0], [-1, 1]).add(1); // x[:,0] + 1

            return tf.concat([updatedTime, updatedState], 1); // Combine along axis 1
        });
        console.log("step taken: new x",x_new);
        return x_new; */
    }

    static get_dist (policy, off_policy){
        /**
         * Get the distribution for the policy given the output of the network
         * @param {tf.Tensor} policy - output of the Neural Network
         * @param {number} off_policy - A constant to add to sigma.
         * @returnm {[MultivariateDist, multivariateDist]} distributions - policy distribution and exploration distribution
         */
        const [mus, sigmas_raw] = tf.split(policy, [2,1], 1); // Split along axis 1 (columns)
        const sigmas = sigmas_raw.sigmoid().mul(0.9).add(0.1);
        let policy_dist = new MultivariateNormal(mus, sigmas);
        if(!off_policy) return [policy_dist, null];
        let exploration_dist = new MultivariateNormal(mus, sigmas.add(tf.scalar(off_policy)));
        return [policy_dist, exploration_dist];
    }

    get_action(x, off_policy){
        /**
         * Computes actions for a given batch of states.
         *
         * @param {tf.Tensor} x - A tensor of shape (batch_size, 3) representing the batch of states.
         * @param {number|null} [offPolicy=null] - A constant added to sigma for off-policy training.
         *                                         Set to null for on-policy training.
         * @returns {{ actions: tf.Tensor, logProbs: tf.Tensor }} - An object containing:
         *          - `actions`: A tensor of shape (batch_size, 2) representing [step in x, step in y].
         *          - `logProbs`: A tensor of shape (batch_size, 2) containing log probabilities of the actions.
         */
        const forward_policy = this.forward_model.apply(x);
        const [policy_dist, exploration_dist] = GFlowNet.get_dist(forward_policy, off_policy);
        const actions = off_policy ? exploration_dist.sample() : policy_dist.sample();
        const log_probs = policy_dist.log_prob(actions);

        return [actions, log_probs];
    }

    get_backward_log_probs(states, actions){
        /**
         * Get the log_probs of the backward pass
         * @param {tf.Tensor} states - batch of states taken from the trajactories
         * @param {tf.Tensor} actions - batch of actions taken during forward pass
         * @returns {tf.Tensor} log_probs of the actions
         */
        return tf.tidy(() => {
            const backward_policy = this.backward_model.apply(states);
            const [policy_dist, _] = GFlowNet.get_dist(backward_policy, null);
            return policy_dist.log_prob(actions);
        });
    }
    
    async train(
        env, 
        batch_size = 64, 
        trajectory_length = 2, 
        n_Iterations = 1024,
        off_policy = null, 
        lossFn = "Trajectory Balance"
    ) {
        const exploration_schedule = Array.isArray(off_policy) ? off_policy : tf.linspace(off_policy || 0, 0, n_Iterations).arraySync();
        console.log("exploration scheduled, start loop")
        for (let i = 0; i < n_Iterations; i++) {
            const logz_loss = this.logz.clone()
            let loss, non_logz_loss;
            this.optimizer_model.minimize(() => {

                return tf.tidy(() => {
                    const x = this.init_state(env, batch_size);
                    let log_probs_forward = tf.zeros([batch_size]);
                    let log_probs_backward = tf.zeros([batch_size]);
                    let trajectory = tf.zeros([batch_size, trajectory_length + 1, 3]);

                    for (let t = 0; t < trajectory_length; t++) {
                        const [actions, logProbs] = this.get_action(x, exploration_schedule[i]);
                        log_probs_forward = log_probs_forward.add(logProbs);
                        const x_prime = GFlowNet.step(x, actions);
                        trajectory = trajectory.slice([0, 0, 0], [batch_size, t + 1, 3]).concat(x_prime.expandDims(1), 1);
                    }
                    console.log("trajectory updated")

                    if (lossFn === "Trajectory Balance") {
                        for (let t = trajectory_length; t > 1; t--) {
                            const logProbs = this.get_backward_log_probs(trajectory.slice([0, t, 0], [batch_size, 1, 3]).reshape([batch_size, 3]),
                                trajectory.slice([0, t, 1], [batch_size, 1, 2]).reshape([batch_size, 2]).sub(
                                    trajectory.slice([0, t - 1, 1], [batch_size, 1, 2]).reshape([batch_size, 2])
                                )
                            );
                            log_probs_backward = log_probs_backward.add(logProbs);
                            console.log("logprobs calculated")
                        }
                    }

                    const logReward = env.log_reward(trajectory.slice([0, trajectory_length - 1, 1], [batch_size, 1, 2]).reshape([batch_size, 2]));
                    const non_logz_loss_temp = log_probs_forward.sub(log_probs_backward).sub(logReward);
                    non_logz_loss = tf.keep(non_logz_loss_temp.clone());
                    const loss_temp = tf.mean(non_logz_loss_temp.add(logz_loss).square());
                    loss = tf.keep(loss_temp.clone());
                    return loss_temp
                });
            });
            this.optimizer_logz.minimize(() =>{
                return tf.tidy(() => {
                    const loss_temp = tf.mean(non_logz_loss.add(this.logz).square());
                    non_logz_loss.dispose();
                    return loss_temp;
                });
            });
            loss.print();
            loss.dispose();
        }
    }

}