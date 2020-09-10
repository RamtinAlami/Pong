import { interval, fromEvent, from, zip } from "rxjs";

import {
  map,
  scan,
  filter,
  merge,
  flatMap,
  take,
  concat,
  takeUntil,
} from "rxjs/operators";

type Paddle_state = Readonly<{
  y: number;
  x: number;
  speed: number;
  size: number;
  direction: number;
  // active_powerup: null;
  // held_powerup: null;
}>;

type heuristic = ball_state | null;

type ai_state = Readonly<{
  paddle: Paddle_state;
  y_target: number;
  difficulty: number;
  heuristic_ball: heuristic;
}>;

type ball_state = Readonly<{
  y: number;
  x: number;
  speedX: number;
  speedY: number;
  size: number;
  velocity: Vector;
}>;

type State = Readonly<{
  player_paddle: Paddle_state;
  ai_paddle: ai_state;
  ball: ball_state;
}>;

class Vector {
  public readonly dx: number;
  public readonly dy: number;

  constructor(
    public readonly magnitude: number = 0,
    public readonly angle: number = 0
  ) {
    this.dx = magnitude * Math.cos(angle);
    this.dy = magnitude * Math.sin(angle);
  }

  scale = (scale: number) => new Vector(this.magnitude * scale, this.angle);
  x_reflect = () => new Vector(-this.magnitude, -this.angle);
  y_reflect = () => new Vector(this.magnitude, -this.angle);
  // y_reflect = () => new Vector(this.magnitude, this.angle)
}

const initial_player_paddle_state: Paddle_state = {
  x: 565,
  y: 100,
  speed: 6,
  size: 1,
  direction: 0,
};

const initial_ai_paddle_state: Paddle_state = {
  x: 25,
  y: 100,
  speed: 4,
  size: 1,
  direction: 0,
};

const initial_ball_State: ball_state = {
  x: 200,
  y: 198,
  speedX: -2,
  speedY: 3,
  size: 1,
  velocity: new Vector(4, 1),
};

const initial_ai_state: ai_state = {
  paddle: initial_ai_paddle_state,
  y_target: 300,
  difficulty: 1,
  heuristic_ball: null,
};

const initialState: State = {
  player_paddle: initial_player_paddle_state,
  ai_paddle: initial_ai_state,
  ball: initial_ball_State,
};

const get_pad_range: (s: State) => { min: Number; max: Number } = (
  s: State
) => {
  return {
    max:
      s.player_paddle.y +
      s.player_paddle.size * game_constants.STARTING_PADDLE_SIZE,

    min: s.player_paddle.y,
  };
};

const has_scored: (s: State) => boolean = (s: State) => s.ball.x >= 564;

const get_pad_rang_aie: (s: State) => { min: Number; max: Number } = (
  s: State
) => {
  return {
    max:
      s.ai_paddle.paddle.y +
      s.ai_paddle.paddle.size * game_constants.STARTING_PADDLE_SIZE,

    min: s.ai_paddle.paddle.y,
  };
};

// function move_paddle(s: State, direction: number): State {
//   // curry it
//   return {
//     ...s, // copies the members of the input state for all but:
//     player_paddle: {
//       ...s.player_paddle,
//       y:
//         s.player_paddle.y + direction < 2
//           ? 2
//           : s.player_paddle.y + direction > 598 - s.player_paddle.size * 80
//           ? 598 - s.player_paddle.size * 80
//           : s.player_paddle.y + direction * s.player_paddle.speed,
//     },
//   };
// }

const game_constants = { MAX_X: 600, MAX_Y: 600, STARTING_PADDLE_SIZE: 80 };

// const move_player_paddle: (direction: number) => (s: State) => State = (
//   direction: number
// ) => (s: State) => {
//   return {
//     ...s, // copies the members of the input state for all but:
//     player_paddle: {
//       ...s.player_paddle,
//       y:
//         s.player_paddle.y + direction < 0
//           ? 0 // if the paddle goes above 0, then we set to 0 so the paddle does not go outside view
//           : s.player_paddle.y + direction >
//             game_constants.MAX_Y -
//               s.player_paddle.size * game_constants.STARTING_PADDLE_SIZE
//           ? game_constants.MAX_Y -
//             s.player_paddle.size * game_constants.STARTING_PADDLE_SIZE    // If paddle goes bellow the MAX_Y, we set to MAX_Y + paddle size, so it doesn't go outside view
//           : s.player_paddle.y + direction * s.player_paddle.speed,  // If paddle is middle of the view, then simply move the y value
//     },
//   };
// };

const get_new_player_y: (direction: number) => (s: State) => Number = (
  direction: number
) => (s: State) => {
  return s.player_paddle.y + direction < 0
    ? 0 // if the paddle goes above 0, then we set to 0 so the paddle does not go outside view
    : s.player_paddle.y + direction >
      game_constants.MAX_Y -
        s.player_paddle.size * game_constants.STARTING_PADDLE_SIZE
    ? game_constants.MAX_Y -
      s.player_paddle.size * game_constants.STARTING_PADDLE_SIZE // If paddle goes bellow the MAX_Y, we set to MAX_Y + paddle size, so it doesn't go outside view
    : s.player_paddle.y + direction * s.player_paddle.speed; // If paddle is middle of the view, then simply move the y value
};
class Tick {
  constructor(public readonly elapsed: number) {}
}
class move_player_paddle {
  constructor(public readonly direction: number) {}
}

type Event = "keydown" | "keyup";
type Key = "ArrowUp" | "ArrowDown" | "Space";
const observeKey = <T>(eventName: string, k: Key, result: () => T) =>
  fromEvent<KeyboardEvent>(document, eventName).pipe(
    filter(({ code }) => code === k),
    filter(({ repeat }) => !repeat),
    map(result)
  );

const startLeftRotate = observeKey(
  "keydown",
  "ArrowUp",
  () => new move_player_paddle(-1)
);
const startRightRotate = observeKey(
  "keydown",
  "ArrowDown",
  () => new move_player_paddle(1)
);
const stopLeftRotate = observeKey(
  "keyup",
  "ArrowUp",
  () => new move_player_paddle(0)
);
const stopRightRotate = observeKey(
  "keyup",
  "ArrowDown",
  () => new move_player_paddle(0)
);

const reduceState = (s: State, e: move_player_paddle | Tick) =>
  e instanceof move_player_paddle
    ? {
        ...s,
        player_paddle: {
          ...s.player_paddle,
          direction: e.direction,
        },
      }
    : {
        ...s,
        player_paddle: {
          ...s.player_paddle,
          y: get_new_player_y(s.player_paddle.direction)(s),
        },
        ai_paddle: {
          ...s.ai_paddle,
          paddle: {
            ...s.ai_paddle.paddle,
            y:
              Math.abs(s.ai_paddle.paddle.y - s.ai_paddle.y_target) <=
              s.ai_paddle.paddle.speed
                ? s.ai_paddle.paddle.y
                : s.ai_paddle.paddle.y < s.ai_paddle.y_target
                ? s.ai_paddle.paddle.y + s.ai_paddle.paddle.speed
                : s.ai_paddle.paddle.y - s.ai_paddle.paddle.speed,
          },
          y_target:
            s.ai_paddle.heuristic_ball !== null
              ? s.ai_paddle.heuristic_ball.x < 40
                ? s.ai_paddle.heuristic_ball.y - 40
                : s.ai_paddle.y_target
              : s.ai_paddle.y_target,

          heuristic_ball:
            s.ai_paddle.heuristic_ball !== null
              ? s.ai_paddle.heuristic_ball.x < 40
                ? null
                : {
                    ...s.ai_paddle.heuristic_ball,
                    x:
                      s.ai_paddle.heuristic_ball.x +
                      get_new_ball_velocity_ai(s).dx * 2,
                    y:
                      s.ai_paddle.heuristic_ball.y +
                      get_new_ball_velocity_ai(s).dy * 2,
                    velocity: get_new_ball_velocity_ai(s),
                  }
              : collision_with_paddle_nai(s)
              ? {
                  ...s.ball,
                  x: s.ball.x + get_new_ball_velocity(s).dx,
                  y: s.ball.y + get_new_ball_velocity(s).dy,
                  velocity: get_new_ball_velocity(s),
                }
              : null,
        },
        ball: {
          ...s.ball,
          x: s.ball.x + get_new_ball_velocity(s).dx,
          y: s.ball.y + get_new_ball_velocity(s).dy,
          velocity: get_new_ball_velocity(s),
        },
      };
/**
 * Updates the state of cpu player by moving it towards a given position
 * @param s current overall state
 * @param position the position it is aiming to go to
 */
function cpu_go_towards(s: State): State {
  return {
    ...s, // copies the members of the input state for all but:
    ai_paddle: {
      ...s.ai_paddle,
      paddle: {
        ...s.ai_paddle.paddle,
        y:
          s.ai_paddle.paddle.x < s.ai_paddle.y_target
            ? s.ai_paddle.paddle.x == s.ai_paddle.y_target
              ? s.ai_paddle.paddle.y
              : s.ai_paddle.paddle.y + s.ai_paddle.paddle.speed
            : s.ai_paddle.paddle.y - s.ai_paddle.paddle.speed,
      },
    },
  };
}

// function move_ball(
//   s: State
// ): { new_ball_speedX: number; new_ball_speedY: number } {
//   const new_ball_speedX: number =
//     s.ball.x < 0 || s.ball.x > 600 ? -s.ball.speedX : s.ball.speedX;
//   const new_ball_speedY: number =
//     s.ball.y < 0 || s.ball.y > 600 ? -s.ball.speedY : s.ball.speedY;

//   return { new_ball_speedX, new_ball_speedY };
// }

function collision_with_paddle(s: State): boolean {
  const { min, max } = get_pad_range(s);

  if (s.ball.x >= 560 && s.ball.y >= min && s.ball.y <= max) {
    return true;
  } else if (
    s.ball.x <= 40 &&
    s.ball.y >= get_pad_rang_aie(s).min &&
    s.ball.y <= get_pad_rang_aie(s).max
  ) {
    return true;
  } else {
    return false;
  }
}

function collision_with_paddle_nai(s: State): boolean {
  const { min, max } = get_pad_range(s);

  if (s.ball.x >= 560 && s.ball.y >= min && s.ball.y <= max) {
    return true;
  } else {
    return false;
  }
}

function get_new_ball_velocity(s: State): Vector {
  // const new_ball_speedX: number =
  //   s.ball.x < 0 || s.ball.x > 600 ? -s.ball.speedX : s.ball.speedX;
  // const new_ball_speedY: number =
  //   s.ball.y < 0 || s.ball.y > 600 ? -s.ball.speedY : s.ball.speedY;

  return s.ball.x <= 5 || s.ball.x >= 600 || collision_with_paddle(s)
    ? s.ball.velocity.x_reflect()
    : s.ball.y <= 5 || s.ball.y >= 600
    ? s.ball.velocity.y_reflect()
    : s.ball.velocity;
}

// function get_new_ball_velocity_ai(s: State): Vector {
//   // const new_ball_speedX: number =
//   //   s.ball.x < 0 || s.ball.x > 600 ? -s.ball.speedX : s.ball.speedX;
//   // const new_ball_speedY: number =
//   //   s.ball.y < 0 || s.ball.y > 600 ? -s.ball.speedY : s.ball.speedY;

//   return s.ai_paddle.heuristic_ball.x <= 5 ||
//     s.ai_paddle.heuristic_ball.x >= 600 ||
//     collision_with_paddle(s)
//     ? s.ai_paddle.heuristic_ball.velocity.x_reflect()
//     : s.ai_paddle.heuristic_ball.y <= 5 || s.ball.y >= 600
//     ? s.ai_paddle.heuristic_ball.velocity.y_reflect()
//     : s.ai_paddle.heuristic_ball.velocity;
// }

function get_new_ball_velocity_ai(s: State): Vector {
  // const new_ball_speedX: number =
  //   s.ball.x < 0 || s.ball.x > 600 ? -s.ball.speedX : s.ball.speedX;
  // const new_ball_speedY: number =
  //   s.ball.y < 0 || s.ball.y > 600 ? -s.ball.speedY : s.ball.speedY;

  return s.ai_paddle.heuristic_ball.x <= 5 ||
    s.ai_paddle.heuristic_ball.x >= 600 ||
    collision_with_paddle(s)
    ? s.ai_paddle.heuristic_ball.velocity.x_reflect()
    : s.ai_paddle.heuristic_ball.y <= 5 || s.ai_paddle.heuristic_ball.y >= 600
    ? s.ai_paddle.heuristic_ball.velocity.y_reflect()
    : s.ai_paddle.heuristic_ball.velocity;
}

// HAS SIDE EFFECTS
function updateView(state: State): void {
  const paddle = document.getElementById("player_paddle")!;
  paddle.setAttribute(
    "transform",
    `translate(${state.player_paddle.x},${state.player_paddle.y}) scale(1 ${state.player_paddle.size})`
  );
  const cpu_paddle = document.getElementById("cpu_paddle")!;
  cpu_paddle.setAttribute(
    "transform",
    `translate(${state.ai_paddle.paddle.x},${state.ai_paddle.paddle.y}) scale(1 ${state.ai_paddle.paddle.size})`
  );
  const ball = document.getElementById("ball")!;
  ball.setAttribute(
    "transform",
    `translate(${state.ball.x},${state.ball.y}) scale(1 ${state.ball.size})`
  );
  // const ball2 = document.getElementById("ball_test")!;
  // if (state.ai_paddle.heuristic_ball !== null) {
  //   ball2.setAttribute(
  //     "transform",
  //     `translate(${state.ai_paddle.heuristic_ball.x},${state.ai_paddle.heuristic_ball.y}) scale(1 ${state.ball.size})`
  //   );
  // }
}

function pong() {
  // Inside this function you will use the classes and functions
  // from rx.js
  // to add visuals to the svg element in pong.html, animate them, and make them interactive.
  // Study and complete the tasks in observable exampels first to get ideas.
  // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
  // You will be marked on your functional programming style
  // as well as the functionality that you implement.
  // Document your code!
  interval(5)
    .pipe(
      map((elapsed) => new Tick(elapsed)),
      merge(startLeftRotate, startRightRotate, stopLeftRotate, stopRightRotate),
      scan(reduceState, initialState)
    )
    .subscribe(updateView);
}

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != "undefined")
  window.onload = () => {
    pong();
  };
