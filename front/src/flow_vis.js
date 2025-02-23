export function plot_flow(p) {
    const scl = 45;
    let cols, rows;
    let particles = [];
    let flowfield;

    p.setup = () => {
      p.createCanvas(750, 750);
      cols = Math.ceil(p.width / scl);
      rows = Math.ceil(p.height / scl);
      flowfield = new Array(cols * rows);
      console.log(flowfield)

      for (let i = 0; i < 1000; i++) {
        particles[i] = new Particle();
      }
    };

    p.draw = () => {
      p.translate(p.height / 2, p.height / 2);
      p.scale(1, -1);
      p.fill(0, 10);
      p.rect(-p.width, -p.height, 2 * p.width, 2 * p.height);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let index = x + y * cols;
          let vX = x * 2 - cols;
          let vY = y * 2 - rows;
          let v = p.createVector(vY, -vX);
          v.normalize();
          flowfield[index] = v;

          p.push();
          p.translate(x * scl - p.width / 2, y * scl - p.height / 2);
          p.fill(255);
          p.stroke(255);
          p.rotate(v.heading());
          p.line(0, 0, 0.5 * scl, 0);
          let arrowSize = 7;
          p.translate(0.5 * scl - arrowSize, 0);
          p.triangle(0, arrowSize / 2, 0, -arrowSize / 2, arrowSize, 0);
          p.pop();
        }
      }

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
        this.maxspeed = 3;
        this.steerStrength = 0.1;
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