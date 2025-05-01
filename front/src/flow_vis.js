import { flow_velocity, flow_n_particles,flow_vectorfield,flow_step,flow_trajectory_step } from './store.js';

let flow_velocity_value;
let flow_n_particles_value;
let flow_vectorfield_value;
let flow_step_value;
let flow_trajectory_step_value;
const flow_steer_value = 0.2;

flow_velocity.subscribe(value => {
    flow_velocity_value = value;
});
flow_n_particles.subscribe(value => {
    flow_n_particles_value = value;
});
flow_vectorfield.subscribe(value => {
    flow_vectorfield_value = value;
});
flow_step.subscribe(value => {
    flow_step_value = value;
});
flow_trajectory_step.subscribe(value => {
    flow_trajectory_step_value = value;
});


export function plot_flow(p, vectors) {
    const scl = 25;
    let cols, rows;
    let particles = [];
    let flowfield;

    const lifespan_min = 100;
    const lifespan_max = 200;

    p.setup = () => {
      p.createCanvas(vectors.cols*scl, vectors.rows*scl);
      cols = Math.ceil(vectors.cols);
      rows = Math.ceil(vectors.rows);

      //generate flowfield from passed vectors
      flowfield = new Array(vectors.cols * vectors.rows);




      for (let i = 0; i < flow_n_particles_value; i++) {
        particles[i] = new Particle();
      }
    };

    p.draw = () => {
      p.translate(p.height / 2, p.height / 2);
      p.scale(1, -1);
      p.fill(68, 1, 84, 10);
      p.rect(-p.width, -p.height, 2 * p.width, 2 * p.height);

      //update flowfield
      for (let i = 0; i < flowfield.length; i++) {
        let vData = vectors.vectors[i];
        let vect = p.createVector(vData.x, vData.y);
        //vect.normalize();
        flowfield[i] = vect;
      };

      if (flow_vectorfield_value) {
        // Draw arrows
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            let index = y * cols + x;
            let vect = flowfield[index];

            let posX = x * scl - p.width / 2 + Math.floor(scl * 0.5);
            let posY = y * scl - p.height / 2 + Math.floor(scl * 0.5);

            p.push();
            p.translate(posX, posY);

            // Scale vector for visibility
            let arrowLength = scl * 0.5 * vect.mag(x,y); // Adjust arrow size
            let angle = vect.heading();

            p.stroke(255);
            p.strokeWeight(1);
            p.fill(255, 255, 255);

            p.rotate(angle);
            p.line(0, 0, arrowLength, 0);

            let arrowSize = 5;
            p.translate(arrowLength, 0);
            p.triangle(0, arrowSize / 2, 0, -arrowSize / 2, arrowSize, 0);

            p.pop();
          }
        }
      }else{
        //draw particles
        for (let i = 0; i < particles.length; i++) {
          particles[i].follow(flowfield);
          particles[i].update();
          particles[i].edges();
        }

        // Adjust number of particles based on flow_n_particles_value
        if (particles.length < flow_n_particles_value) {
            let numToAdd = flow_n_particles_value - particles.length;
            for (let i = 0; i < numToAdd; i++) {
                particles.push(new Particle());
            }
        } else if (particles.length > flow_n_particles_value) {
            particles = particles.slice(0, flow_n_particles_value);
        }
      }
    };

    //particle functions
    class Particle {
      constructor() {
        this.respawn();
      }

      respawn() {
        this.pos = p.createVector(
          p.random(-p.width / 2, p.width / 2),
          p.random(-p.height / 2, p.height / 2)
        );
        this.vel = p.createVector(0, 0);
        this.acc = p.createVector(0, 0);
        this.prevPos = this.pos.copy();
        this.size = 4;

        this.lifespan = p.int(p.random(lifespan_min/flow_velocity_value, lifespan_max/flow_velocity_value));
        this.age = 0;
        //console.log(this.lifespan)
      }

      update() {
        this.vel.add(this.acc);
        this.vel.limit(flow_velocity_value);
        this.pos.add(this.vel);
        this.acc.mult(0);

        this.age++;
        let alpha = p.map(this.age, 0, 50, 0, 100, true);

        //draw particle
        p.noStroke();
        p.fill(253, 231, 37, alpha);
        p.circle(this.pos.x, this.pos.y, this.size);

        this.lifespan--;
        if (this.lifespan <= 0) {
          this.respawn();
        }


      }

      follow(vectors) {
        let x = Math.floor(p.map(this.pos.x, -p.width / 2, p.width / 2, 0, cols - 1, true));
        let y = Math.floor(p.map(this.pos.y, -p.height / 2, p.height / 2, 0, rows - 1, true));
        let index = y * cols + x;
        let force = vectors[index].copy();
        force.mult(flow_steer_value);
        this.applyForce(force);
      }

      applyForce(force) {
        this.acc.add(force);
      }

      updatePrev() {
        this.prevPos.x = this.pos.x;
        this.prevPos.y = this.pos.y;
      }

      edges() {
        if (this.pos.x > p.width / 2 || this.pos.x < -p.width / 2 ||
        this.pos.y > p.height / 2 || this.pos.y < -p.height / 2
        ) {
          this.respawn();
        }
      }
    }
  }


