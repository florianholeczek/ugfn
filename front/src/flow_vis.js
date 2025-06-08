import { flow_velocity, flow_n_particles,flow_vectorfield,flow_vectors,flow_changed } from './store.js';

let flow_velocity_value;
let flow_n_particles_value;
let flow_vectorfield_value;
let flow_vectors_value;
let flow_changed_value;
const flow_steer_value = 0.8;

flow_velocity.subscribe(value => {
    flow_velocity_value = value;
});
flow_n_particles.subscribe(value => {
    flow_n_particles_value = value;
});
flow_vectorfield.subscribe(value => {
    flow_vectorfield_value = value;
});
flow_vectors.subscribe(value => {
    flow_vectors_value = value;
});
flow_changed.subscribe(value => {
    flow_changed_value = value;
});


export function plot_flow(p, vectorgrid_size, img_path) {
    const scl = 25;
    let particles = [];
    let flowfield;
    let backgroundImage;

    p.preload = () => {
      backgroundImage = p.loadImage(img_path);//("images/run1.png");
    };

    const lifespan_min = 100;
    const lifespan_max = 200;

    p.setup = () => {
      p.createCanvas(vectorgrid_size*scl, vectorgrid_size*scl);
      flowfield = new Array(vectorgrid_size*vectorgrid_size);

      for (let i = 0; i < flow_n_particles_value; i++) {
        particles[i] = new Particle();
      }
    };


    p.draw = () => {
      /*
      if (p.frameCount % 3600 === 0){
        p.clear()
      }*/
      p.translate(p.height / 2, p.height / 2);

      p.tint(255,10)
      p.image(backgroundImage, -p.width/2, -p.height/2, p.width, p.height);
      p.scale(1, -1);

      //update flowfield
      if(flow_changed_value){
        for (let i = 0; i < flow_vectors_value.length; i+=2) {
          let vect = p.createVector(flow_vectors_value[i], flow_vectors_value[i+1]);
          //vect.normalize();
          flowfield[i/2] = vect;
        };
        flow_changed.set(false);
      }


      if (flow_vectorfield_value) {
        // Draw arrows
        for (let y = 0; y < vectorgrid_size; y++) {
          for (let x = 0; x < vectorgrid_size; x++) {
            let index = y * vectorgrid_size + x;
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
        //p.fill(253, 231, 37, alpha);
        p.fill(255, alpha);
        p.circle(this.pos.x, this.pos.y, this.size);

        this.lifespan--;
        if (this.lifespan <= 0) {
          this.respawn();
        }


      }

      follow(f) {
        let gridX = p.map(this.pos.x, -p.width / 2, p.width / 2, 0, vectorgrid_size - 1);
        let gridY = p.map(this.pos.y, -p.height / 2, p.height / 2, 0, vectorgrid_size - 1);

        let x0 = Math.floor(gridX);
        let x1 = Math.min(x0 + 1, vectorgrid_size - 1);
        let y0 = Math.floor(gridY);
        let y1 = Math.min(y0 + 1, vectorgrid_size - 1);

        let sx = gridX - x0;
        let sy = gridY - y0;

        let i00 = y0 * vectorgrid_size + x0;
        let i10 = y0 * vectorgrid_size + x1;
        let i01 = y1 * vectorgrid_size + x0;
        let i11 = y1 * vectorgrid_size + x1;

        let v00 = f[i00].copy();
        let v10 = f[i10].copy();
        let v01 = f[i01].copy();
        let v11 = f[i11].copy();

        // Interpolate in x direction
        let vx0 = p5.Vector.lerp(v00, v10, sx);
        let vx1 = p5.Vector.lerp(v01, v11, sx);

        // Interpolate in y direction
        let force = p5.Vector.lerp(vx0, vx1, sy);


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


