import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../public/lottie/sidebar/", import.meta.url));
// Temporal Bézier handles: progressive acceleration and a long, soft landing.
const ease = { x: 0.42, y: 0 };
const settle = { x: 0.22, y: 1 };

function keyframes(entries) {
  return { a: 1, k: entries.map(([t, s], index) => ({
    t, s, ...(index < entries.length - 1 ? { e: entries[index + 1][1], o: ease, i: settle } : {}),
  })) };
}

function animatedValues(start, middle, end, middleFrame = 18, endFrame = 42, delay = 0, hold = 4) {
  return keyframes([
    [0, start], ...(delay ? [[delay, start]] : []),
    [middleFrame, middle], [middleFrame + hold, middle], [endFrame, end],
  ]);
}

function linePath(name, points, closed = false) {
  const vectors = points.map(([x, y]) => [x, y]);
  const zeroTangents = vectors.map(() => [0, 0]);
  return {
    ty: "sh", nm: name, ix: 1,
    ks: { a: 0, k: { i: zeroTangents, o: zeroTangents, v: vectors, c: closed } },
  };
}

function roundedRect(name, x, y, width, height, radius = 2) {
  return { ty: "rc", nm: name, p: { a: 0, k: [x + width / 2, y + height / 2] }, s: { a: 0, k: [width, height] }, r: { a: 0, k: radius } };
}

function ellipse(name, x, y, radiusX, radiusY = radiusX) {
  return { ty: "el", nm: name, p: { a: 0, k: [x, y] }, s: { a: 0, k: [radiusX * 2, radiusY * 2] } };
}

function stroke(width = 1.8) {
  return {
    ty: "st", nm: "Optical stroke", c: { a: 0, k: [0.12, 0.14, 0.18, 1] },
    o: { a: 0, k: 100 }, w: { a: 0, k: width }, lc: 2, lj: 2, ml: 4,
  };
}

function vector(name, shape, options = {}) {
  const anchor = options.anchor ?? [12, 12];
  const position = options.position ?? anchor;
  return {
    ty: "gr", nm: name, ix: 1, np: 3, cix: 2, bm: 0, hd: false,
    it: [
      shape,
      stroke(options.width),
      ...(options.trim ? [{ ty: "tm", nm: "Check drawing", s: { a: 0, k: 0 }, e: options.trim, o: { a: 0, k: 0 }, m: 1 }] : []),
      {
        ty: "tr", nm: "Part transform", a: { a: 0, k: anchor },
        p: options.positionKeyframes ?? (options.positionAnimation ? animatedValues(position, options.positionAnimation[0], options.positionAnimation[1], options.positionAnimation[2] ?? 18, 42, options.delay ?? 0) : { a: 0, k: position }),
        s: options.scaleKeyframes ?? (options.scaleAnimation ? animatedValues(options.scaleAnimation[0], options.scaleAnimation[1], options.scaleAnimation[0], options.scaleAnimation[2] ?? 18, 42, options.delay ?? 0) : { a: 0, k: [100, 100] }),
        r: options.rotationKeyframes ?? (options.rotationAnimation ? animatedValues([0], [options.rotationAnimation[0]], [0], options.rotationAnimation[1] ?? 18, 42, options.delay ?? 0) : { a: 0, k: 0 }),
        o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 },
      },
    ],
  };
}

const rect = (name, x, y, width, height, radius, options) => vector(name, roundedRect(name, x, y, width, height, radius), options);
const oval = (name, x, y, rx, ry, options) => vector(name, ellipse(name, x, y, rx, ry), options);
const path = (name, points, closed = false, options = {}) => vector(name, linePath(name, points, closed), options);
const move = (dx, dy, frame = 18, delay = 0) => ({ delay, positionAnimation: [[12 + dx, 12 + dy], [12, 12], frame] });

// All parts return to their authored geometry before the final four-frame pause.
// At 20px display size, 1.8 composition units produce a 1.5px main stroke.
function curve(name, points, incoming, outgoing, options) {
  const shape = linePath(name, points);
  shape.ks.k.i = incoming;
  shape.ks.k.o = outgoing;
  return vector(name, shape, options);
}
function morph(name, start, end, frame, options = {}) {
  const shape = linePath(name, start);
  const initial = shape.ks.k;
  shape.ks = animatedValues([initial], [linePath(name, end).ks.k], [initial], frame, 42, options.delay ?? 0);
  return vector(name, shape, options);
}
// Checks remain complete at rest; a short wipe precedes the ordered redraw.
const drawCheck = (delay) => ({ trim: keyframes([[0, [100]], [4, [0]], ...(delay ? [[4 + delay, [0]]] : []), [18 + delay, [100]], [42, [100]]]) });
const spin = { rotationKeyframes: keyframes([[0, [0]], [58, [360]], [62, [360]]]) };
// The webhook's three lobes balance below the canvas midpoint. Rotate them
// together about that optical center, with a full second for the revolution.
const webhookOrbit = {
  center: [12, 13],
  rotation: keyframes([[0, [0]], [60, [360]], [64, [360]]]),
};
const assets = {
  dashboard: [
    rect("Upper left", 3.5, 3.5, 7, 7, 1.4, move(-1.2, -1.2, 20)),
    rect("Upper right", 14, 3.5, 6.5, 5, 1.3, move(1.2, -1.2, 20)),
    rect("Lower left", 3.5, 14, 7, 6.5, 1.4, move(-1.2, 1.2, 20)),
    rect("Lower right", 14, 12, 6.5, 8.5, 1.4, move(1.2, 1.2, 20)),
  ],
  checklist: [
    path("First check", [[3.5, 5.5], [5, 7], [8, 3.8]], false, drawCheck(0)),
    path("Second check", [[3.5, 12], [5, 13.5], [8, 10.3]], false, drawCheck(6)),
    path("Third check", [[3.5, 18.5], [5, 20], [8, 16.8]], false, drawCheck(12)),
    path("Row one", [[11.5, 5.5], [20.5, 5.5]]),
    path("Row two", [[11.5, 12], [20.5, 12]]),
    path("Row three", [[11.5, 18.5], [18, 18.5]]),
  ],
  cards: [
    path("Rear card edge", [[8, 4], [19, 4], [20, 5], [20, 16]], false),
    rect("Project card", 4, 8, 12, 12, 1.8, move(1.8, -1.8, 18)),
    path("Card title", [[7.5, 12], [12.5, 12]], false, move(1.8, -1.8, 18)),
    path("Card detail", [[7.5, 16], [10.5, 16]], false, { ...move(1.8, -1.8, 18), width: 1.6 }),
  ],
  video: [
    rect("Camera body", 3.5, 6, 11.5, 12, 2),
    path("Lens", [[18, 9], [21, 7], [21, 17], [18, 15]], false, move(-1.5, 0, 18)),
  ],
  clock: [
    oval("Clock face", 12, 12, 8.5, 8.5),
    path("Hands", [[12, 6.5], [12, 12], [16, 14]], false, spin),
  ],
  folder: [
    path("Folder back", [[3.5, 9], [3.5, 5.5], [9, 5.5], [11, 8], [20, 8]], false, { anchor: [3.5, 9], position: [3.5, 9], rotationAnimation: [-12, 18] }),
    path("Folder front", [[3.5, 10.5], [21, 10.5], [19, 20], [4.5, 20], [3.5, 10.5]], false, { anchor: [4.5, 20], position: [4.5, 20], rotationAnimation: [7, 18] }),
  ],
  trash: [
    path("Basket", [[6, 9], [7, 20], [17, 20], [18, 9]]),
    path("Rib one", [[10, 11.5], [10.4, 17]], false, { width: 1.6 }),
    path("Rib two", [[14, 11.5], [13.6, 17]], false, { width: 1.6 }),
    path("Lid", [[4.5, 6.5], [19.5, 6.5]], false, { anchor: [4.5, 6.5], position: [4.5, 6.5], rotationAnimation: [-14, 18] }),
    path("Handle", [[9, 6.5], [9, 3.5], [15, 3.5], [15, 6.5]], false, { anchor: [4.5, 6.5], position: [4.5, 6.5], rotationAnimation: [-14, 18] }),
  ],
  network: [
    // Curved, interlocking webhook arms; see LICENSE-webhook.txt for source and license.
    curve("Webhook arm 1",
      [[18,16.98],[12.01,16.98],[9.53,18.88],[5.03107,20.879624],[2,17],[2.57,15]],
      [[0,0],[0.0,0.0],[0.53,-0.96],[1.780807,0.444611],[0.000573,1.835471],[-0.37,0.6]],
      [[0,0.0],[-1.1,0.0],[-0.863245,1.619803],[-1.780807,-0.444611],[0.01,-0.7],[0,0]],
      { width: 2 }),
    curve("Webhook arm 2",
      [[6,17],[9.13,11.22],[8.63,8.12],[8.5227,4.060806],[12.021112,1.999333],[15.52,4.06]],
      [[0,0],[0.0,0.0],[0.6,0.92],[-0.704732,1.271981],[-1.45416,0.000168],[-0.705025,-1.271818]],
      [[0,0],[0.53,-0.97],[-0.770948,-1.232973],[0.704732,-1.271981],[1.45416,-0.000168],[0,0]],
      { width: 2 }),
    curve("Webhook arm 3",
      [[12,6],[15.13,11.73],[18,13],[22.0,17.0],[18,21]],
      [[0,0],[0.0,0.0],[-1.1,0],[0.0,-2.209139],[2.209139,0.0]],
      [[0,0],[0.53,0.97],[2.209139,0.0],[0.0,2.209139],[0,0]],
      { width: 2 }),
  ],
  inbox: [
    path("Delivery sheet", [[7.5, 11], [7.5, 3.5], [16.5, 3.5], [16.5, 11]], false, move(0, 3, 22)),
    path("Sheet line", [[10.5, 7], [13.5, 7]], false, { ...move(0, 3, 22), width: 1.6 }),
    path("Tray", [[4, 12.5], [8, 12.5], [9.5, 15], [14.5, 15], [16, 12.5], [20, 12.5], [20, 20], [4, 20]], true, move(0, 0.9, 27, 19)),
  ],
  chart: [
    path("Baseline", [[3.5, 4], [3.5, 20.5], [21, 20.5]], false, { width: 1.6 }),
    path("Bar one", [[8, 17], [8, 13]], false, { anchor: [8, 17], position: [8, 17], scaleAnimation: [[100, 100], [100, 150], 16], width: 2.4 }),
    path("Bar two", [[13, 17], [13, 9]], false, { anchor: [13, 17], position: [13, 17], scaleAnimation: [[100, 100], [100, 130], 21], delay: 5, width: 2.4 }),
    path("Bar three", [[18, 17], [18, 5]], false, { anchor: [18, 17], position: [18, 17], scaleAnimation: [[100, 100], [100, 115], 26], delay: 10, width: 2.4 }),
  ],
  books: [
    rect("Book one", 3.5, 5, 4.5, 15, 0.8),
    path("Spine one", [[5, 8.5], [6.5, 8.5]], false, { width: 1.5 }),
    rect("Book two", 9.5, 4, 4.5, 16, 0.8),
    rect("Tilting book", 16, 6, 4, 14, 0.8, move(0, -2.6, 20)),
  ],
  people: [
    oval("Member head", 9, 7.5, 3, 3, move(0.5, 0, 22, 4)),
    curve("Member shoulders", [[3.5, 20], [9, 14], [14.5, 20]], [[0, 0], [-3.5, 0], [0, -3.5]], [[0, -3.5], [3.5, 0], [0, 0]], move(0.5, 0, 22, 4)),
    curve("Colleague head", [[16, 4.5], [16, 10.5]], [[0, 0], [4.5, 0]], [[4.5, 0], [0, 0]], move(-2.3, 0, 20)),
    curve("Colleague shoulders", [[17, 14], [20.5, 20]], [[0, 0], [0, -3]], [[2.5, 0], [0, 0]], move(-2.3, 0, 20)),
  ],
  invite: [
    oval("Person head", 8.5, 7.5, 3, 3, move(-0.7, 0, 22, 6)),
    curve("Person shoulders", [[3, 20], [8.5, 14], [14, 20]], [[0, 0], [-3.5, 0], [0, -3.5]], [[0, -3.5], [3.5, 0], [0, 0]], move(-0.7, 0, 22, 6)),
    path("Plus vertical", [[18.5, 8], [18.5, 14]], false, { anchor: [18.5, 11], position: [18.5, 11], scaleKeyframes: keyframes([[0, [100, 100]], [5, [15, 15]], [20, [112, 112]], [24, [112, 112]], [42, [100, 100]]]) }),
    path("Plus horizontal", [[15.5, 11], [21.5, 11]], false, { anchor: [18.5, 11], position: [18.5, 11], scaleKeyframes: keyframes([[0, [100, 100]], [5, [15, 15]], [20, [112, 112]], [24, [112, 112]], [42, [100, 100]]]) }),
  ],
  sliders: [
    morph("Rail one left", [[3.5, 5], [6, 5]], [[3.5, 5], [8.5, 5]], 16, { width: 1.6 }),
    morph("Rail one right", [[12, 5], [20.5, 5]], [[14.5, 5], [20.5, 5]], 16, { width: 1.6 }),
    morph("Rail two left", [[3.5, 12], [11, 12]], [[3.5, 12], [8.5, 12]], 21, { width: 1.6, delay: 5 }),
    morph("Rail two right", [[17, 12], [20.5, 12]], [[14.5, 12], [20.5, 12]], 21, { width: 1.6, delay: 5 }),
    morph("Rail three left", [[3.5, 19], [6, 19]], [[3.5, 19], [8.5, 19]], 26, { width: 1.6, delay: 10 }),
    morph("Rail three right", [[12, 19], [20.5, 19]], [[14.5, 19], [20.5, 19]], 26, { width: 1.6, delay: 10 }),
    oval("Cursor one", 9, 5, 2.4, 2.4, move(2.5, 0, 16)),
    oval("Cursor two", 14, 12, 2.4, 2.4, move(-2.5, 0, 21, 5)),
    oval("Cursor three", 9, 19, 2.4, 2.4, move(2.5, 0, 26, 10)),
  ],
};

function animationData(name, shapes) {
  const circular = name === "clock" || name === "network";
  const op = name === "network" ? 66 : circular ? 64 : 46;
  // Preserve the folder's established opening cadence (~1 s).
  const fr = name === "folder" ? 48 : 60;
  if (name === "network") {
    shapes = [{ ty: "gr", nm: "Coordinated orbit", it: [
      ...shapes, { ty: "tr", a: { a: 0, k: webhookOrbit.center }, p: { a: 0, k: webhookOrbit.center },
        s: { a: 0, k: [100, 100] }, r: webhookOrbit.rotation, o: { a: 0, k: 100 },
        sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
    ] }];
  }
  return {
    v: "5.12.2", fr, ip: 0, op, w: 24, h: 24, nm: `NITE ${name}`,
    ddd: 0, assets: [],
    layers: [{
      ddd: 0, ind: 1, ty: 4, nm: name, sr: 1,
      ks: {
        o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
        p: { a: 0, k: [12, 12, 0] }, a: { a: 0, k: [12, 12, 0] }, s: { a: 0, k: [100, 100, 100] },
      }, ao: 0, shapes, ip: 0, op, st: 0, bm: 0,
    }],
  };
}

await mkdir(output, { recursive: true });
await Promise.all(Object.entries(assets).map(([name, shapes]) =>
  writeFile(join(output, `${name}.json`), `${JSON.stringify(animationData(name, shapes))}\n`, "utf8"),
));
