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
  // active_powerup: null;
  // held_powerup: null;
}>;

type ball_state = Readonly<{
  y: number;
  x: number;
  speedX: number;
  speedY: number;
  size: number;
}>;

type State = Readonly<{
  player_paddle: Paddle_state;
  cpu_paddle: Paddle_state;
  ball: ball_state;
}>;

const initial_player_paddle_state: Paddle_state = {
  x: 565,
  y: 100,
  speed: 8,
  size: 1,
};

const initial_cpu_paddle_state: Paddle_state = {
  x: 25,
  y: 100,
  speed: 8,
  size: 1,
};

const initial_ball_State: ball_state = {
  x: 200,
  y: 198,
  speedX: -2,
  speedY: 3,
  size: 1,
};

const initialState: State = {
  player_paddle: initial_player_paddle_state,
  cpu_paddle: initial_cpu_paddle_state,
  ball: initial_ball_State,
};

const get_pad_range: (y: number) => (size: number) => { x: Number } = (
  y: Number
) => (size: Number) => {
  x: 2;
};

function move_paddle(s: State, direction: number): State {
  // curry it
  return {
    ...s, // copies the members of the input state for all but:
    player_paddle: {
      ...s.player_paddle,
      y:
        s.player_paddle.y + direction < 2
          ? 2
          : s.player_paddle.y + direction > 598 - s.player_paddle.size * 80
          ? 598 - s.player_paddle.size * 80
          : s.player_paddle.y + direction * s.player_paddle.speed,
    },
  };
}

class Tick {
  constructor(public readonly elapsed: number) {}
}
// class Rotate { constructor(public readonly direction:number) {} }
// class Thrust { constructor(public readonly on:boolean) {} }

/**
 * Updates the state of cpu player by moving it towards a given position
 * @param s current overall state
 * @param position the position it is aiming to go to
 */
function cpu_go_towards(s: State, position: Number): State {
  return {
    ...s, // copies the members of the input state for all but:
    cpu_paddle: {
      ...s.cpu_paddle,
      y:
        s.cpu_paddle.x < position
          ? s.cpu_paddle.x == position
            ? s.cpu_paddle.y
            : s.cpu_paddle.y + s.cpu_paddle.speed
          : s.cpu_paddle.y - s.cpu_paddle.speed,
    },
  };
}

function move_ball(s: State): State {
  const new_ball_speedX: number =
    s.ball.x < 0 || s.ball.x > 600 ? -s.ball.speedX : s.ball.speedX;
  const new_ball_speedY: number =
    s.ball.y < 0 || s.ball.y > 600 ? -s.ball.speedY : s.ball.speedY;

  return {
    ...s, // copies the members of the input state for all but:
    ball: {
      ...s.ball,
      speedX: new_ball_speedX,
      speedY: new_ball_speedY,
      x: s.ball.x + new_ball_speedX,
      y: s.ball.y + new_ball_speedY,
    },
  };
}

function updateView(state: State): void {
  const paddle = document.getElementById("player_paddle")!;
  paddle.setAttribute(
    "transform",
    `translate(${state.player_paddle.x},${state.player_paddle.y}) scale(1 ${state.player_paddle.size})`
  );
  const cpu_paddle = document.getElementById("cpu_paddle")!;
  cpu_paddle.setAttribute(
    "transform",
    `translate(${state.cpu_paddle.x},${state.cpu_paddle.y}) scale(1 ${state.cpu_paddle.size})`
  );
  const ball = document.getElementById("ball")!;
  ball.setAttribute(
    "transform",
    `translate(${state.ball.x},${state.ball.y}) scale(1 ${state.ball.size})`
  );
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
  fromEvent<KeyboardEvent>(document, "keydown")
    .pipe(
      filter(({ code }) => code === "ArrowUp" || code === "ArrowDown"),
      filter(({ repeat }) => !repeat),

      flatMap((d) =>
        interval(10).pipe(
          takeUntil(
            fromEvent<KeyboardEvent>(document, "keyup").pipe(
              filter(({ code }) => code === d.code)
            )
          ),
          map((_) => d)
        )
      ),

      map(({ code }) => (code === "ArrowUp" ? -1 : 1)),
      scan(move_paddle, initialState),
      map(updateView)
    )
    .subscribe();
}

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != "undefined")
  window.onload = () => {
    pong();
  };
