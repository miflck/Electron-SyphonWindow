let canvas;
let circles = [];
const numCircles = 10;

class Circle {
  constructor() {
    this.x = random(20, width - 20); // Random x position
    this.y = random(20, height - 20); // Random y position
    this.size = random(20, 100); // Random size between 20 and 100
    this.xSpeed = random(2, 5);
    this.ySpeed = random(2, 5);
    this.color = color(random(255), random(255), random(255)); // Random color
  }

  update() {
    // Update position
    this.x += this.xSpeed;
    this.y += this.ySpeed;

    // Check for bouncing
    if (this.x + this.size / 2 > width || this.x - this.size / 2 < 0) {
      this.xSpeed *= -1;
    }
    if (this.y + this.size / 2 > height || this.y - this.size / 2 < 0) {
      this.ySpeed *= -1;
    }
  }

  display() {
    fill(this.color);
    ellipse(this.x, this.y, this.size);
  }
}

function setup() {
  // pixelDensity must be set before the canvas is created, otherwise the
  // canvas gets recreated and the GL context changes under us
  pixelDensity(1);
  canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.style("display", "block");
  frameRate(60);

  for (let i = 0; i < numCircles; i++) {
    circles.push(new Circle());
  }

  Syphon.setName("P5JsElectronApp");
  Syphon.useIpc(); // lets the control window start/stop Syphon
}

function draw() {
  background(200);

  // WEBGL has its origin in the center, the circles use top-left coordinates
  push();
  translate(-width / 2, -height / 2);
  for (let circle of circles) {
    circle.update();
    circle.display();
  }
  pop();

  drawSyphon();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  for (let circle of circles) {
    circle.x = random(width);
    circle.y = random(height);
  }
}

function keyPressed() {
  if (key === " ") {
    circles.push(new Circle());
  }
}

function mousePressed() {
  if (circles.length > 1) {
    circles.pop();
  }
}
