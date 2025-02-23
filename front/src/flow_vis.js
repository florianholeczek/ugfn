export function plot_flow(p, vectors) {
    const scl = 50;
    let cols, rows;
    let particles = [];
    let flowfield;

    p.setup = () => {
      p.createCanvas(vectors.cols*scl, vectors.rows*scl);
      cols = Math.ceil(vectors.cols);
      rows = Math.ceil(vectors.rows);

      //generate flowfield from passed vectors
      flowfield = new Array(vectors.cols * vectors.rows);

      for (let i = 0; i < flowfield.length; i++) {
        let vData = vectors.vectors[i];
        flowfield[i] = p.createVector(vData.x, vData.y);
    }

      for (let i = 0; i < 1000; i++) {
        particles[i] = new Particle();
      }
    };

    p.draw = () => {
      p.translate(p.height / 2, p.height / 2);
      p.scale(1, -1);
      p.fill(0, 10);
      p.rect(-p.width, -p.height, 2 * p.width, 2 * p.height);

      for (let i = 0; i < particles.length; i++) {
        particles[i].follow(flowfield);
        particles[i].update();
        particles[i].edges();
      }
    };

    class Particle {
      constructor() {
        this.pos = p.createVector(p.random(-p.width / 2, p.width / 2), p.random(-p.height / 2, p.height / 2));
        this.vel = p.createVector(0, 0);
        this.acc = p.createVector(0, 0);
        this.maxspeed = 1;
        this.steerStrength = 0.4;
        this.prevPos = this.pos.copy();
        this.size = 4;
      }

      update() {
        this.vel.add(this.acc);
        this.vel.limit(this.maxspeed);
        this.pos.add(this.vel);
        this.acc.mult(0);
        p.noStroke();
        p.fill(255);
        p.circle(this.pos.x, this.pos.y, this.size);
      }

      follow(vectors) {
        let x = Math.floor(p.map(this.pos.x, -p.width / 2, p.width / 2, 0, cols - 1, true));
        let y = Math.floor(p.map(this.pos.y, -p.height / 2, p.height / 2, 0, rows - 1, true));
        let index = y * cols + x;
        let force = vectors[index].copy();
        force.mult(this.steerStrength);
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
        this.pos.y > p.height / 2 || this.pos.y < -p.height / 2) {

        // Respawn at a random position inside the canvas
        this.pos = p.createVector(
            p.random(-p.width / 2, p.width / 2),
            p.random(-p.height / 2, p.height / 2)
        );

        // Reset velocity and acceleration to zero
        this.vel.set(0, 0);
        this.acc.set(0, 0);

        // Update previous position for smooth movement
        this.updatePrev();

        }
      }
    }
  }