import { interval, fromEvent, from } from "rxjs";

import {
  map,
  scan,
  filter,
  merge
} from "rxjs/operators";

// THIS SECTION WILL BE USED FOR DECLARING TYPES AND CLASSES
type Paddle_state = Readonly<{
  y: number;
  x: number;
  speed: number;
  size: number;
  direction: number;
}>;

type heuristic_ball = ball_state | null;

type power_up_obj = active_power_up | null;

const enum power_up_type {
  none = 0,
  speed = 1,
  health = 2,
  return = 3,
  expand = 4,
}

// The following class
class active_power_up {
  constructor(
    public readonly power_up_t: power_up_type,
    public readonly duration_left: number
  ) { }
  tick: () => power_up_obj = () => {
    if (this.duration_left <= 0) return null;
    else {
      return new active_power_up(this.power_up_t, this.duration_left - 1);
    }
  };
}

type player_state = Readonly<{
  paddle: Paddle_state;
  power_up_holding: power_up_type;
  activated_power_up: power_up_obj;
}>;

type ai_state = Readonly<{
  paddle: Paddle_state;
  y_target: number;
  heuristic_ball: heuristic_ball;
  power_up_holding: power_up_type;
  activated_power_up: power_up_obj;
}>;

type ball_state = Readonly<{
  y: number;
  x: number;
  speedX: number;
  speedY: number;
  size: number;
  velocity: Vector;
}>;

type power_up_ball_state = Readonly<{
  y: number;
  x: number;
  velocity: Vector;
  is_active: boolean;
  ms_left_visible: number;
  size: number;
}>;

type Meta_State = Readonly<{
  difficulty: number;
  has_started: boolean;
  is_paused: boolean;
  power_up_activated: boolean;
  has_ended: boolean;
  rand_seed: number;
  button_clicked: number; // 0 is none, 1,2,3 are options
  last_hit: Player_type;
}>;

type State = Readonly<{
  player_state: player_state;
  ai_paddle: ai_state;
  ball: ball_state;
  power_up_ball: power_up_ball_state;
  player_score: number;
  ai_score: number;
  meta_state: Meta_State;
}>;

class Vector {
  public readonly dx: number;
  public readonly dy: number;

  /**
   * The constructor for the vector class
   * @param magnitude The magnitude of the vector
   * @param angle The angle in radians
   */
  constructor(
    public readonly magnitude: number = 0,
    public readonly angle: number = 0
  ) {
    this.dx = magnitude * Math.cos(angle);
    this.dy = magnitude * Math.sin(angle);
  }

  scale = (scale: number) => new Vector(this.magnitude * scale, this.angle);

  // This will reflect the vector along the x axis
  x_reflect = () => new Vector(-this.magnitude, -this.angle);

  // This will reflect the vector along the y axis
  y_reflect = () => new Vector(this.magnitude, -this.angle);

  /**
   * This is similar to x_reflect; however, it will be used for paddles to change
   * the magnitude and angle based on "strength" which determined by which part of the paddle
   * collides with the ball
   * @param strength This is the amount the vector will changed after reflection
   */
  x_reflect_paddle = (strength: number) => {
    const new_mag = this.magnitude * (strength + 0.6);
    // Only change the angle if strength a lot more
    const new_angle = this.angle + strength * 0.5;
    return new Vector(-new_mag, -new_angle);
  };
}

// THIS SECTION WILL BE THE INITIATION OF THE STATE
const initial_player_paddle_state: Paddle_state = {
  x: 565,
  y: 100,
  speed: 5,
  size: 1,
  direction: 0,
};

const initial_ai_paddle_state: Paddle_state = {
  x: 25,
  y: 100,
  speed: 5,
  size: 1,
  direction: 0,
};

const initial_player_state: player_state = {
  paddle: initial_player_paddle_state,
  power_up_holding: power_up_type.return,
  activated_power_up: null,
};

const initial_ai_state: ai_state = {
  paddle: initial_ai_paddle_state,
  y_target: 300,
  heuristic_ball: null,
  power_up_holding: power_up_type.none,
  activated_power_up: null,
};

const initial_ball_State: ball_state = {
  x: 200,
  y: 198,
  speedX: -2,
  speedY: 3,
  size: 1,
  velocity: new Vector(3.5, 1),
};

const initial_meta_state: Meta_State = {
  difficulty: 3,
  is_paused: true,
  has_started: false,
  power_up_activated: false,
  has_ended: false,
  button_clicked: 0,
  rand_seed: 1,
  last_hit: Player_type.AI,
};

const initial_pb_state: power_up_ball_state = {
  y: 200,
  x: 400,
  velocity: new Vector(0.4, 1),
  is_active: false,
  size: 1,
  ms_left_visible: 0,
};

const initialState: State = {
  player_state: initial_player_state,
  ai_paddle: initial_ai_state,
  ball: initial_ball_State,
  player_score: 0,
  ai_score: 0,
  meta_state: initial_meta_state,
  power_up_ball: initial_pb_state,
};

// Game constants
// Encouraged to use to avoid the requirement to change many location if some aspect changes
const enum game_constants {
  MAX_X = 600,
  MAX_Y = 600,
  STARTING_PADDLE_SIZE = 80,
  STARTING_BALL_SIZE = 14,
  STARTING_PBALL_SIZE = 65,
  MAX_SCORE = 7,
  POWERUP_TIME = 600,
  MAX_RAND_NUM_GET = 111,
}

// The following enum is to be used for functions that require identification of side
// enums are used to establish consistency and reduce coding bugs
const enum Player_type {
  CONTROLLED_PLAYER,
  AI,
}

// The following class are the event classes that will be constructed by keyboard down
// Classes are created because they store a value
// TODO complete this ^
class Tick {
  constructor(public readonly elapsed: number) { }
}
class move_player_paddle {
  constructor(public readonly direction: number) { }
}

class use_power_up {
  constructor(public readonly activated: boolean) { }
}

// pause did not require to be a class; however, for consistency was created as a class
class pause {
  constructor() { }
}

// The following class is constructed by mouse click
class mouse_click {
  constructor(public readonly x: number, public readonly y: number) { }
}

type Event = "keydown" | "keyup";
type Key = "ArrowUp" | "ArrowDown" | "Space" | "Escape";
/**
 * Following ObserveKey function will be used to get the user keyboard input
 * This function is based on the code by Tim Dwyer at https://tgdwyer.github.io/asteroids/
 * @param eventName The even that will invoke the function
 * @param k The key that will watched for the event
 * @param result The function that will be evoked upon event on key occurring
 */
const observeKey = <T>(eventName: Event, k: Key, result: () => T) =>
  fromEvent<KeyboardEvent>(document, eventName).pipe(
    filter(({ code }) => code === k),
    filter(({ repeat }) => !repeat),
    map(result)
  );

// Up Arrow key for moving up
const startUpMove = observeKey(
  "keydown",
  "ArrowUp",
  () => new move_player_paddle(-1)
);
const StopUpMove = observeKey(
  "keyup",
  "ArrowUp",
  () => new move_player_paddle(0)
);

// Down Arrow key for moving down
const StartDownMove = observeKey(
  "keydown",
  "ArrowDown",
  () => new move_player_paddle(1)
);
const StopDownMove = observeKey(
  "keyup",
  "ArrowDown",
  () => new move_player_paddle(0)
);

// Space button for selecting power up
const StartPowerUpUse = observeKey(
  "keydown",
  "Space",
  () => new use_power_up(true)
);
const EndPowerUpUse = observeKey(
  "keyup",
  "Space",
  () => new use_power_up(false)
);

// Esc button for pausing the game
const PauseGame = observeKey("keydown", "Escape", () => new pause());

/**
 * Following ObserveKey function will be used to get the user mouse click
 * The function does is not as flexible as observeKey because only used in the
 * context of mousedown.
 *
 * This function is inspired by the observeKey function by Tim Dwyer
 * @param result The function that will be evoked upon event on key occurring
 */
const observeMouse = <T>(result: (clientX: number, clientY: number) => T) =>
  fromEvent<MouseEvent>(document, "mousedown").pipe(
    map(({ clientX, clientY }) => result(clientX, clientY))
  );

const mouseObs = observeMouse((x, y) => new mouse_click(x, y));

// NEED TO COMBINED TWO INTO ONE AND USE TYPE
// TODO does this need type???
// TODO The function is curried because of setting of functions before condition checking later
const get_paddle_range = (Paddle_owner: Player_type) => (s: State) => {
  // is_ai is used because the code will be more readable
  const is_ai: boolean = Paddle_owner === Player_type.AI;
  const y: number = is_ai ? s.ai_paddle.paddle.y : s.player_state.paddle.y;
  const size: number = is_ai
    ? s.ai_paddle.paddle.size
    : s.player_state.paddle.size;
  return {
    max: y + size * game_constants.STARTING_PADDLE_SIZE,
    min: y,
  };
};

const has_scored: (s: State) => boolean = (s: State) => s.ball.x >= 564;

const get_new_player_y: (direction: number) => (s: State) => number = (
  direction: number
) => (s: State) => {
  return s.player_state.paddle.y + direction < 0
    ? 0 // if the paddle goes above 0, then we set to 0 so the paddle does not go outside view
    : s.player_state.paddle.y + direction >
      game_constants.MAX_Y -
      s.player_state.paddle.size * game_constants.STARTING_PADDLE_SIZE
      ? game_constants.MAX_Y -
      s.player_state.paddle.size * game_constants.STARTING_PADDLE_SIZE // If paddle goes bellow the MAX_Y, we set to MAX_Y + paddle size, so it doesn't go outside view
      : s.player_state.paddle.y + direction * s.player_state.paddle.speed; // If paddle is middle of the view, then simply move the y value
};

// SOME HELPER FUNCTIONS

// LCG using GCC's constants
// ! BASED ON WEEK 5 OBSERVABLES.TS
const psudo_randm: (seed: number) => number = (seed: number) => {
  return ((1103515245 * seed + 12345) % 0x80000000) / (0x80000000 - 1);
};

/**
 * Function implements a pipe function to apply a series of functions to an input value similar to rxjs's pipe
 * @param funcs Array of functions that take starting_v type and return the same type
 * @param starting_v The value that the functions will be applied to
 */
function pipeFuncs<T>(funcs: Array<(T) => T>, starting_v: T): T {
  return funcs.reduce((curr_v, f) => f(curr_v), starting_v)
}


// TODO ADD COMMENT HERE
function mapFuncs<T, V>(funcs: Array<(T) => V>, value: T): Array<V> {
  return funcs.map((f) => f(value))
}



/**
 * Takes an array of functions and applies the value to all of them while ignoring their outputs.
 *
 * This function will be used for updating the html tags for the impure functions. It would not make sense for this to be used for pure functions.
 * @param funcs An array of functions that the input is of the type value
 * @param value The value that will be applied to all the funcs
 */
function apply_value_to_all<T, V>(funcs: Array<(T) => V>, value: T): void {
  funcs.forEach(f => f(value))
}

/**
 * Generates "almost a" Normally distributed number based on input variance and mean
 * The function is based on the Box-Muller transform
 * This function is not perfect as Box-Muller requires two random with the range of (0,1); however provided with [0,1) which would make the output imperfect but still alright for
 * @param seed The seed that the number will be generated on
 * @param variance The variance of the generated number
 * @param mean The mean of the generated number
 */
function randn_bm(seed: number, variance: number, mean: number): number {
  const u = psudo_randm(seed);
  const v = psudo_randm(seed + 1); // need to change the seed

  // standard normal distributed number generated
  const Z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

  // convert standard normal to desired normal distribution
  const X = variance * Z + mean;
  return X;
}

/**
 * Function returns a number of the selected button
 * 0 is default if selected area does not have a button in it
 * 1, 2 or 3 if one of the selected areas selected
 * @param x The x position of the mouse cursor
 * @param y The y position of the mouse cursor
 */
function button_click_check(x: number, y: number): number {
  if (x > 173 && x < 443) {
    if (y > 278 && y < 342) {
      return 1;
    } else if (y > 362 && y < 432) {
      return 2;
    } else if (y > 442 && y < 505) {
      return 3;
    }
  }
  return 0;
}

/**
 * Sets the starting random seed to the mouse x + mouse y
 * This function is ran at the start to have different seeds for games while keeping the random number generators pure
 * @param s The input state that will create the new state with update seed
 * @param x The x position of the mouse cursor
 * @param y The y position of the mouse cursor
 */
function set_seed(s: State, x: number, y: number): State {
  return { ...s, meta_state: { ...s.meta_state, rand_seed: x + y } };
}

/**
 * This function returns a amount the AI will make mistake
 * The output is primarily based on the player score, ai score and game difficulty
 * The details of equations are explained in the report
 * @param s The current game state
 */
const prediction_deviation: (s: State) => number = (s: State) => {
  const player_help = 0.5 * (1 / (1 + Math.exp(s.ai_score - 4))) + 0.05; // as the player scores they get less help
  const ai_help = 0.35 * (1 / (1 + Math.exp(-s.player_score + 4))); // as the player scores they get less help
  const variance = (player_help + ai_help) * (90 / s.meta_state.difficulty); // 1, 2 or 3
  const generated_number = randn_bm(s.meta_state.rand_seed, variance, 0);
  return generated_number;
};

// These event types are used for reduce functions
// For consistency and reduction of bugs, they're defined here
type EventType = move_player_paddle | Tick | pause | mouse_click | use_power_up;

// used for keyboard to update
function move_player_paddle_func(s: State, e: EventType): State {
  // The error is to make sure the right event is evoked
  if (!(e instanceof move_player_paddle)) throw "Wrong Event type";

  // Sets the new player direction
  return {
    ...s,
    player_state: {
      ...s.player_state,
      paddle: {
        ...s.player_state.paddle,
        direction: e.direction,
      },
    },
  };
}

function pause_func(s: State, e: EventType): State {
  if (s.meta_state.has_started && !s.meta_state.has_ended) {
    return {
      ...s,
      meta_state: {
        ...s.meta_state,
        is_paused: !s.meta_state.is_paused,
      },
    };
  } else {
    return s;
  }
}

function set_difficulty(new_difficulty: number, s: State): State {
  return {
    ...s,
    meta_state: { ...s.meta_state, difficulty: new_difficulty },
  };
}

function set_start(s: State): State {
  return {
    ...s,
    meta_state: { ...s.meta_state, has_started: true, is_paused: false },
  };
}

function unpause(s: State): State {
  return {
    ...s,
    meta_state: { ...s.meta_state, is_paused: false },
  };
}

function game_start_menu(s: State, mouse_x: number, mouse_y: number) {
  const seed_set_s = set_seed(s, mouse_x, mouse_y);
  const button_clicked = button_click_check(mouse_x, mouse_y); // only return 1, 2, 3 or 0 if
  if (button_clicked != 0) {
    const diff_set_s = set_difficulty(button_clicked, seed_set_s);
    return set_start(diff_set_s);
  } else {
    return s;
  }
}

function reset_game() {
  return initialState;
}

// TODO CHECK TWO IF STATEMENTS
function pause_menu(s: State, mouse_x: number, mouse_y: number): State {
  const button_clicked = button_click_check(mouse_x, mouse_y); // only return 1, 2, 3 or 0 if none
  if (button_clicked == 1) {
    return unpause(s);
  }
  if (button_clicked == 2) {
    return reset_game();
  } else {
    return s;
  }
}

function end_menu(s: State, mouse_x: number, mouse_y: number): State {
  const button_clicked = button_click_check(mouse_x, mouse_y); // only return 1, 2, 3 or 0 if none
  if (button_clicked == 1) {
    return reset_game();
  } else {
    return s;
  }
}

function mouse_click_func(s: State, e: EventType): State {
  if (!(e instanceof mouse_click)) throw "wrong";

  if (!s.meta_state.has_started) {
    return game_start_menu(s, e.x, e.y);
  } else if (s.meta_state.has_ended) {
    return end_menu(s, e.x, e.y);
  } else if (s.meta_state.is_paused) {
    return pause_menu(s, e.x, e.y);
  }
  return s;
}

function activate_power_ball(s: State, e: EventType): State {
  if (!(e instanceof use_power_up)) throw "wrong";
  return {
    ...s,
    meta_state: {
      ...s.meta_state,
      power_up_activated: e.activated,
    },
  };
}

const move_player_tick_function: (s: State) => State = (s: State) => {
  const new_player_y: number = get_new_player_y(
    s.player_state.paddle.direction
  )(s);
  return {
    ...s,
    player_state: {
      ...s.player_state,
      paddle: {
        ...s.player_state.paddle,
        y: new_player_y,
      },
    },
  };
};

// returns a number between 0-600 based on new target_y
function get_new_ai_y(curr_y, target_y, paddle_speed): number {
  // since we can't get perfect, it aims to be in the range of speed
  if (Math.abs(curr_y - target_y) <= paddle_speed) return curr_y;
  // if not in the range, check if current > target, then reduce, if less add
  else return curr_y < target_y ? curr_y + paddle_speed : curr_y - paddle_speed;
}

// finds the new y
function move_ai_tick_function(s: State): State {
  const new_ai_y: number = get_new_ai_y(
    s.ai_paddle.paddle.y,
    s.ai_paddle.y_target,
    s.ai_paddle.paddle.speed
  );
  return {
    ...s,
    ai_paddle: {
      ...s.ai_paddle,
      paddle: {
        ...s.ai_paddle.paddle,
        y: new_ai_y,
      },
    },
  };
}

/**
 * Given a y value, it will return 0 or max screen size if goes further
 * @param y The y value that will be bounded to the screen size
 */
const in_y_range: (y: number) => number = (y: number) =>
  Math.max(Math.min(y, 540), 0);

const get_y_target = (s: State) => {
  // checks if heuristic ball has been created
  if (s.ai_paddle.heuristic_ball !== null) {
    return s.ai_paddle.heuristic_ball.x < 40
      ? s.ai_paddle.heuristic_ball.y - 40 + prediction_deviation(s)
      : s.ai_paddle.y_target;
  } else {
    // moves the paddle up after striking which makes the AI seem more real
    return s.ball.x < 40
      ? randn_bm(s.meta_state.rand_seed + 3, 250, 300)
      : s.ai_paddle.y_target;
  }
};

function find_ai_target_tick_function(s: State): State {
  const new_player_y: number = in_y_range(get_y_target(s));
  return {
    ...s,
    ai_paddle: {
      ...s.ai_paddle,
      y_target: new_player_y,
    },
  };
}


// TODO fix this into smaller ones
function move_heuristic_ball_tick_function(s: State): State {
  const new_player_y: number = get_new_player_y(
    s.player_state.paddle.direction
  )(s);
  return {
    ...s,
    ai_paddle: {
      ...s.ai_paddle,
      heuristic_ball:
        s.ai_paddle.heuristic_ball !== null
          ? s.ai_paddle.heuristic_ball.x < 40
            ? null
            : {
              ...s.ai_paddle.heuristic_ball,
              x:
                s.ai_paddle.heuristic_ball.x +
                new_ball_velocity(s, Ball_type.heuristic_ball).dx * 2,
              y:
                s.ai_paddle.heuristic_ball.y +
                new_ball_velocity(s, Ball_type.heuristic_ball).dy * 2,
              velocity: new_ball_velocity(s, Ball_type.heuristic_ball),
            }
          : ball_collide_with_paddle(Player_type.CONTROLLED_PLAYER, s)
            ? {
              ...s.ball,
              x: s.ball.x + new_ball_velocity(s, Ball_type.main_ball).dx,
              y: s.ball.y + new_ball_velocity(s, Ball_type.main_ball).dy,
              velocity: new_ball_velocity(s, Ball_type.main_ball),
            }
            : null,
    },
  };
}

// TODO break this a little
function move_ball_tick_function(s: State): State {
  if ((s.ball.x > 562 || s.ball.x < 34) && !check_collision_with_both_paddle(s)) {
    return {
      ...s,
      // generates a new ball at a random location with random angle but init magnitude
      ball: {
        ...s.ball,
        x: randn_bm(s.meta_state.rand_seed + 10, 50, 100),
        y: randn_bm(s.meta_state.rand_seed + 11, 50, 100),
        velocity: new Vector(
          initial_ball_State.velocity.magnitude,
          psudo_randm(s.meta_state.rand_seed + 13)
        ),
      },
    };
  } else {
    return {
      ...s,
      ball: {
        ...s.ball,
        x: s.ball.x + new_ball_velocity(s, Ball_type.main_ball).dx,
        y: s.ball.y + new_ball_velocity(s, Ball_type.main_ball).dy,
        velocity: new_ball_velocity(s, Ball_type.main_ball),
      },
    };
  }
}

function move_power_ball_tick_function(s: State): State {
  return {
    ...s,
    power_up_ball: {
      ...s.power_up_ball,
      x: s.power_up_ball.x + get_new_power_ball_velocity(s).dx,
      y: s.power_up_ball.y + get_new_power_ball_velocity(s).dy,
      velocity: get_new_power_ball_velocity(s),
    },
  };
}

function update_score_tick_function(s: State): State {
  return {
    ...s,
    player_score: s.ball.x > 562 ? s.player_score + 1 : s.player_score,
    ai_score: s.ball.x < 34 ? s.ai_score + 1 : s.ai_score,
  };
}

function check_for_last_hit(s: State): State {
  if (ball_collide_with_paddle(Player_type.AI, s)) {
    return {
      ...s,
      meta_state: {
        ...s.meta_state,
        last_hit: Player_type.AI
      }
    }
  } else if (ball_collide_with_paddle(Player_type.CONTROLLED_PLAYER, s)) {
    return {
      ...s,
      meta_state: {
        ...s.meta_state,
        last_hit: Player_type.CONTROLLED_PLAYER
      }
    }
  } else {
    return s;
  }
}


function update_seed_tick_function(s: State): State {
  return {
    ...s,
    meta_state: {
      ...s.meta_state,
      rand_seed: (s.meta_state.rand_seed + game_constants.MAX_RAND_NUM_GET) % 100000000000,
    },
  };
}

const check_if_player_power_up_activated: (p: Player_type) => (s: State) => State = (p: Player_type) => (s: State) => {
  const has_activated: boolean = p === Player_type.AI ? psudo_randm(s.meta_state.rand_seed + 50) < 0.001 : s.meta_state.power_up_activated;
  const power_up_holding: power_up_type = p === Player_type.AI ? s.ai_paddle.power_up_holding : s.player_state.power_up_holding;

  if (has_activated && power_up_holding !== null) {
    if (p === Player_type.AI) {
      return {
        ...s,
        ai_paddle: {
          ...s.ai_paddle,
          power_up_holding: power_up_type.none,
          activated_power_up: s.ai_paddle.power_up_holding !== power_up_type.none ? new active_power_up(
            s.ai_paddle.power_up_holding,
            game_constants.POWERUP_TIME
          ) : s.ai_paddle.activated_power_up,
        },
      };
    }
    return {
      ...s,
      player_state: {
        ...s.player_state,
        power_up_holding: power_up_type.none,
        activated_power_up: s.player_state.power_up_holding !== power_up_type.none ? new active_power_up(
          s.player_state.power_up_holding,
          game_constants.POWERUP_TIME
        ) : s.player_state.activated_power_up,
      },
    };
  }
  return s;
}



// TODO ADD COMMENT
function ball_collision_ball(s: State): boolean {
  const ball_x: number = s.ball.x;
  const ball_y: number = s.ball.y;
  const pb_x: number = s.power_up_ball.x;
  const pb_y: number = s.power_up_ball.y;


  const y_in_range: boolean = ball_y >= pb_y && ball_y <= pb_y + game_constants.STARTING_PBALL_SIZE;

  const x_in_range: boolean = ball_x >= pb_x && ball_x <= pb_x + game_constants.STARTING_PBALL_SIZE;

  return y_in_range && x_in_range && s.power_up_ball.is_active;
}

function return_random_power_up(s: State): power_up_type {
  const rand_num = psudo_randm(s.meta_state.rand_seed + 40)
  if (rand_num < 0.25) {
    return power_up_type.expand;
  } else if (rand_num > 0.25 && rand_num < 0.50) {
    return power_up_type.health;
  } else if (rand_num > 0.50 && rand_num < 0.75) {
    return power_up_type.speed;
  } else if (rand_num > 0.75) {
    return power_up_type.return;
  }
  return power_up_type.none;
}

function check_pb_interaction_tick(s: State): State {
  if (ball_collision_ball(s)) {
    if (s.meta_state.last_hit === Player_type.AI && s.ai_paddle.power_up_holding === power_up_type.none) {
      return {
        ...s,
        power_up_ball: {
          ...s.power_up_ball,
          is_active: false,
        },
        ai_paddle: {
          ...s.ai_paddle,
          power_up_holding: return_random_power_up(s)
        }
      }
    } else if (s.meta_state.last_hit === Player_type.CONTROLLED_PLAYER && s.player_state.power_up_holding === power_up_type.none) {
      return {
        ...s,
        power_up_ball: {
          ...s.power_up_ball,
          is_active: false,
        },
        player_state: {
          ...s.player_state,
          power_up_holding: return_random_power_up(s)
        }
      }
    }
  }
  return s;
}

function appear_pb_on_screen_tick(s: State): State {
  return {
    ...s,
    power_up_ball: {
      ...s.power_up_ball,
      is_active: psudo_randm(s.meta_state.rand_seed + 41) < 0.001 ? true : s.power_up_ball.is_active,
    }
  }
}

// Curried function because we are going call for different players
const active_power_up_tick: (p: Player_type) => (s: State) => State = (
  p: Player_type
) => (s: State) => {
  // the powerup object
  const active_power_up_o =
    p === Player_type.AI
      ? s.ai_paddle.activated_power_up
      : s.player_state.activated_power_up;

  if (active_power_up_o !== null) {
    if (p === Player_type.AI) {
      return {
        ...s,
        ai_paddle: {
          ...s.ai_paddle,
          activated_power_up: active_power_up_o.tick(),
        },
      };
    } else {
      return {
        ...s,
        player_state: {
          ...s.player_state,
          activated_power_up: active_power_up_o.tick(),
        },
      };
    }
  }
  return s;
};

const health_power_up_function: (p: Player_type) => (s: State) => State = (
  p: Player_type
) => (s: State) => {
  const active_power_up_o =
    p === Player_type.AI
      ? s.ai_paddle.activated_power_up
      : s.player_state.activated_power_up;
  if (active_power_up_o.power_up_t === power_up_type.health) {
    if (p === Player_type.AI) {
      return {
        ...s,
        player_score: s.player_score - 1,
      };
    } else {
      return {
        ...s,
        ai_score: s.ai_score - 1,
      };
    }
  } else return s;
};

const speed_power_up_function: (p: Player_type) => (s: State) => State = (
  p: Player_type
) => (s: State) => {
  const active_power_up_o =
    p === Player_type.AI
      ? s.ai_paddle.activated_power_up
      : s.player_state.activated_power_up;
  if (active_power_up_o.power_up_t === power_up_type.speed) {
    if (p === Player_type.CONTROLLED_PLAYER) {
      return {
        ...s,
        player_state: {
          ...s.player_state,
          paddle: {
            ...s.player_state.paddle,
            // if ending soon then set back to normal
            speed: active_power_up_o.duration_left > 1 ? 10 : initial_player_paddle_state.speed,
          },
        },
      };
    } else {
      return {
        ...s,
        ai_paddle: {
          ...s.ai_paddle,
          paddle: {
            ...s.ai_paddle.paddle,
            // if ending soon then set back to normal
            speed: active_power_up_o.duration_left > 1 ? 4 : 1,
          },
        },
      };
    }
  }
  return s;
};

const expand_power_up_function: (p: Player_type) => (s: State) => State = (
  p: Player_type
) => (s: State) => {
  const active_power_up_o =
    p === Player_type.AI
      ? s.ai_paddle.activated_power_up
      : s.player_state.activated_power_up;

  if (active_power_up_o.power_up_t === power_up_type.expand) {
    if (p === Player_type.CONTROLLED_PLAYER) {
      return {
        ...s,
        player_state: {
          ...s.player_state,
          paddle: {
            ...s.player_state.paddle,
            // if ending soon then set back to normal
            size: active_power_up_o.duration_left > 1 ? 2 : 1,
          },
        },
      };
    } else {
      return {
        ...s,
        ai_paddle: {
          ...s.ai_paddle,
          paddle: {
            ...s.ai_paddle.paddle,
            // if ending soon then set back to normal
            size: active_power_up_o.duration_left > 1 ? 2 : 1,
          },
        },
      };
    }
  }
  return s;
};

const return_power_up_function: (p: Player_type) => (s: State) => State = (
  p: Player_type
) => (s: State) => {
  const active_power_up_o =
    p === Player_type.AI
      ? s.ai_paddle.activated_power_up
      : s.player_state.activated_power_up;
  if (active_power_up_o.power_up_t === power_up_type.return) {
    return {
      ...s,
      ball: {
        ...s.ball,
        velocity: active_power_up_o.duration_left > game_constants.POWERUP_TIME - 1 ? s.ball.velocity.x_reflect() : s.ball.velocity,
      },
    };
  }
  return s;
};

const get_paddle_contact_strength: (p: Player_type) => (s: State) => number = (
  p: Player_type
) => (s: State) => {
  const paddle_state: Paddle_state = p === Player_type.AI ? s.ai_paddle.paddle : s.player_state.paddle;
  const paddle_y: number = paddle_state.y;
  const paddle_size: number = paddle_state.size * game_constants.STARTING_PADDLE_SIZE;
  const paddle_center: number = paddle_y + (paddle_size / 2)

  const ball_y: number = s.ball.y;

  const dist_to_center = Math.abs(paddle_center - ball_y) / (paddle_size / 2)
  return dist_to_center;
};

const active_power_up_effect_tick: (p: Player_type) => (s: State) => State = (
  p: Player_type
) => (s: State) => {
  const active_power_up_o =
    p === Player_type.AI
      ? s.ai_paddle.activated_power_up
      : s.player_state.activated_power_up;

  if (active_power_up_o !== null) {
    const power_up_tick_functions: Array<(
      p: Player_type
    ) => (s: State) => State> = [
        health_power_up_function,
        speed_power_up_function,
        expand_power_up_function,
        return_power_up_function,
      ];
    // we first apply player type to each function before piping them into
    // series of function
    return pipeFuncs(mapFuncs(power_up_tick_functions, p), s);
  }
  return s;
};

// HERE BECAUSE WE NEED TO HAVE ABSTRACTION
function check_end_game_tick_function(s: State): State {
  const game_ended: boolean = s.player_score >= 7 || s.ai_score >= 7;
  return {
    ...s,
    meta_state: {
      ...s.meta_state,
      is_paused: game_ended,
      has_ended: game_ended,
    },
  };
}


function Tick_func(s: State, e: EventType): State {
  const tick_functions: Array<(s: State) => State> = [
    move_player_tick_function,
    move_ai_tick_function,
    active_power_up_effect_tick(Player_type.CONTROLLED_PLAYER),
    active_power_up_effect_tick(Player_type.AI),
    active_power_up_tick(Player_type.AI),
    active_power_up_tick(Player_type.CONTROLLED_PLAYER),
    find_ai_target_tick_function,
    move_heuristic_ball_tick_function,
    move_ball_tick_function,
    move_power_ball_tick_function,
    update_score_tick_function,
    update_seed_tick_function,
    check_end_game_tick_function,
    check_if_player_power_up_activated(Player_type.CONTROLLED_PLAYER),
    check_if_player_power_up_activated(Player_type.AI),
    check_for_last_hit,
    check_pb_interaction_tick,
    appear_pb_on_screen_tick,
  ];

  // if game is paused, then tick functions is not performed to preserve state
  const new_state = s.meta_state.is_paused
    ? s
    : pipeFuncs(tick_functions, s);

  return new_state;
}


const reduceState = (s: State, e: EventType): State => {
  if (e instanceof mouse_click) return mouse_click_func(s, e);
  else if (e instanceof use_power_up) return activate_power_ball(s, e);
  else if (e instanceof move_player_paddle)
    return move_player_paddle_func(s, e);
  else if (e instanceof pause) return pause_func(s, e);
  else if (e instanceof Tick) return Tick_func(s, e);
  else return s;
};

// TURN THIS INTO A SMALLER REUSABLE ONE BY COMBINING TWO
function ball_collide_with_paddle(
  Paddle_owner: Player_type,
  s: State
): boolean {
  const { min, max } = get_paddle_range(Paddle_owner)(s);
  const ball_size = game_constants.STARTING_BALL_SIZE * s.ball.size;

  // TODO change those to constants for checking
  const x_line_has_passed =
    Paddle_owner === Player_type.AI ? s.ball.x <= 40 : s.ball.x >= 560;

  // To make sure that even the edge of the ball can make contact, we will add ball size to the range when checking for contact
  const y_collided = s.ball.y >= min - ball_size && s.ball.y <= max + ball_size;

  return x_line_has_passed && y_collided;
}

function check_collision_with_both_paddle(s: State): boolean {
  return (
    ball_collide_with_paddle(Player_type.AI, s) ||
    ball_collide_with_paddle(Player_type.CONTROLLED_PLAYER, s)
  );
}

function get_new_power_ball_velocity(s: State): Vector {
  return s.power_up_ball.x <= 100 || s.power_up_ball.x >= 400
    ? s.power_up_ball.velocity.x_reflect()
    : s.power_up_ball.y <= 100 || s.ball.y >= 400
      ? s.power_up_ball.velocity.y_reflect()
      : s.power_up_ball.velocity;
}

const enum Ball_type {
  main_ball,
  heuristic_ball,
  power_ball,
}

// TODO FIX THIS FOR THE TYPE OF POWERBALL
function new_ball_velocity(s: State, ball_type: Ball_type): Vector {
  // The following two are not required; however, they make the code cleaner and more readable
  const is_h_ball = ball_type === Ball_type.heuristic_ball;
  const is_main_ball = ball_type === Ball_type.main_ball;

  const ball_state = is_h_ball
    ? s.ai_paddle.heuristic_ball
    : is_main_ball
      ? s.ball
      : s.power_up_ball;

  const y_pos = ball_state.y;
  const x_pos = ball_state.x;
  const ball_size = ball_state.size * game_constants.STARTING_BALL_SIZE;
  const velocity = ball_state.velocity;

  if (
    x_pos <= ball_size ||
    x_pos >= game_constants.MAX_X - ball_size ||
    check_collision_with_both_paddle(s)
  ) {
    if (ball_collide_with_paddle(Player_type.AI, s)) {
      return velocity.x_reflect_paddle(get_paddle_contact_strength(Player_type.AI)(s));
    } else if (ball_collide_with_paddle(Player_type.CONTROLLED_PLAYER, s)) {

      return velocity.x_reflect_paddle(get_paddle_contact_strength(Player_type.CONTROLLED_PLAYER)(s));
    }
    return velocity.x_reflect();
  }
  else if (y_pos <= ball_size || y_pos >= game_constants.MAX_Y - ball_size)
    return velocity.y_reflect();
  else return velocity;
}

// The following functions are in regards to updating the view
// Most of these functions have side effects because they update the view
// These function will only be in the subscription call due to their side effects

// This enum will keep track of the entity types, The values happen to be the html tag ids; however, this enum has been created to primarily make coding cleaner, more bug free and consistent
const enum Ent_type {
  CONTROLLED_PLAYER = "player_paddle",
  AI = "cpu_paddle",
  main_ball = "ball",
  heuristic_ball = "ai_heuristic_ball",
  power_ball = "power_box"
}

// These are the main entities that will be displayed, this array can be modified before running for debugging and displaying heuristic_ball or other entities
const rendered_entities: Array<Ent_type> = [
  Ent_type.CONTROLLED_PLAYER,
  Ent_type.AI,
  Ent_type.main_ball,
  Ent_type.power_ball,
];

// This function will return the x,y,size attribute; the reason, we are using this is because of an evolving state that changed quite a bit and having a getter function will reduce the number places that need to be modified when the whole state model changes
const get_position_size: (
  s: State
) => (entity_type: Ent_type) => { x: number; y: number; size: number } = (
  s: State
) => (entity_type: Ent_type) => {
  switch (entity_type) {
    case Ent_type.CONTROLLED_PLAYER:
      return {
        x: s.player_state.paddle.x,
        y: s.player_state.paddle.y,
        size: s.player_state.paddle.size,
      };
      break;
    case Ent_type.AI:
      return {
        x: s.ai_paddle.paddle.x,
        y: s.ai_paddle.paddle.y,
        size: s.ai_paddle.paddle.size,
      };
      break;
    case Ent_type.main_ball:
      return { x: s.ball.x, y: s.ball.y, size: s.ball.size };
      break;
    case Ent_type.heuristic_ball:
      return {
        x: s.ai_paddle.heuristic_ball.x,
        y: s.ai_paddle.heuristic_ball.y,
        size: s.ai_paddle.heuristic_ball.size,
      };
      break;
    case Ent_type.power_ball:
      return {
        x: s.power_up_ball.x,
        y: s.power_up_ball.y,
        size: s.power_up_ball.size,
      };
      break;
    default:
      return
  }
};


// This function applies transformation to an html svg of one of the entities 
const apply_svg_transform: (
  entity_type: Ent_type
) => (x: number) => (y: number) => (scale: number) => void = (
  entity_type: Ent_type
) => (x: number) => (y: number) => (scale: number) => {
  const entity = document.getElementById(entity_type)!;
  entity.setAttribute("transform", `translate(${x},${y}) scale(${scale})`);
};

// This function takes a position&location getter function and an entity type and will set the new position and size attribute
const update_entity: (
  pos_size_getter: (
    entity_type: Ent_type
  ) => { x: number; y: number; size: number }
) => (entity_type: Ent_type) => void = (
  pos_size_getter: (
    entity_type: Ent_type
  ) => { x: number; y: number; size: number }
) => (entity_type: Ent_type) => {
  const controller_position_size = pos_size_getter(entity_type);
  apply_svg_transform(entity_type)(controller_position_size.x)(
    controller_position_size.y
  )(controller_position_size.size);
};


// This is a score getter function that will return the score of the side
// this function is curried becuase if a list of sides was needed to be checked, a map function could have applied this to all. On the other hand, in this version of the game only two sides exists thus the curried feature has not been full utuilized
const get_side_score: (s: State) => (side: Player_type) => number = (
  s: State
) => (side: Player_type) => {
  return side === Player_type.CONTROLLED_PLAYER ? s.player_score : s.ai_score;
};

// We will use this function to return the prefix of the score bubble id in the html
// This is not required, however, changes to the html occured a lot, thus this will decrease the number of changes required to the ts bu creating abstraction
const get_score_ui_prefix: (side: Player_type) => string = (
  side: Player_type
) => (side == Player_type.AI ? "ai_ui_score_" : "player_ui_score_");

// This function will update a given score bubble based on the latest score
const update_score_GUI: (
  get_score: (side: Player_type) => number
) => (side: Player_type) => void = (
  get_score: (side: Player_type) => number
) => (side: Player_type) => {
  // returns the score of a side
  const score = get_score(side);
  // gets the prefix for the ui id to update
  const html_score_id_prefix = get_score_ui_prefix(side);
  // if in the range, then it will update the corresponding score bubble by filling it indicating a score
  if (score > 0 && score <= game_constants.MAX_SCORE) {
    const ui_score_object = document.getElementById(
      html_score_id_prefix + String(score)
    )!;
    ui_score_object.setAttribute("fill", `white`);
  }
};

// This function will reset all the scores for both sides to reset the game in the end
function reset_score(): void {

  // A recursive function that will work backwards and set all score bubbles to empty to reset the game
  const reset_score_aux: (html_score_id_prefix) => (current_score) => void = (
    html_score_id_prefix
  ) => (current_score) => {
    if (current_score == 0) {
      return;
    }
    const ui_score_object = document.getElementById(
      html_score_id_prefix + String(current_score)
    )!;
    ui_score_object.setAttribute("fill", `none`);
    reset_score_aux(html_score_id_prefix)(current_score - 1);
  };

  // we call the recursive function on both player types because they have diffrent guid
  reset_score_aux(get_score_ui_prefix(Player_type.CONTROLLED_PLAYER))(game_constants.MAX_SCORE);
  reset_score_aux(get_score_ui_prefix(Player_type.AI))(game_constants.MAX_SCORE);
}

// This enum will keep track of the menus, The values happen to be the html tag ids; however, this enum has been created to primarily make coding cleaner, more bug free and consistent
const enum MenuType {
  PauseMenu = "pauseMenu",
  EndMenu = "EndGameMenu",
  StartMenu = "startMenu",
}

// This function will display the right menu, based on the display condition
function displayMenu(m: MenuType, display_condition: boolean): void {
  const entity = document.getElementById(m)!;
  if (display_condition) {
    entity.setAttribute("style", `visibility: visible`);
  } else {
    entity.setAttribute("style", `visibility: hidden`);
  }
}

// This function will set the write end text visible based on the input boolean indicating if the player has won
function updateWinText(has_player_won: boolean): void {
  // SET THE RIGHT ONE
  const html_tag_text_winner = has_player_won ? "end_win" : "end_lose";
  const entity = document.getElementById(html_tag_text_winner)!;
  entity.setAttribute("style", `visibility: visible`);
}

// This function will hide both win texts on the display for the next round, where only the right one will be set visible
function resetWinText(): void {
  // FIRST RESET BOTH
  const entity_win = document.getElementById("end_win")!;
  entity_win.setAttribute("style", `visibility: hidden`);
  const entity_lose = document.getElementById("end_lose")!;
  entity_lose.setAttribute("style", `visibility: hidden`);
}

// This function will set the powerup ball/box visible based on the state
function power_ball_show(s: State): void {
  // FIRST RESET BOTH
  const entity_pb = document.getElementById("power_box")!;
  if (s.power_up_ball.is_active) {
    entity_pb.setAttribute("style", `visibility: visible`);

  } else {
    entity_pb.setAttribute("style", `visibility: hidden`);
  }
}

// This function will display the bar in the powerup box indicating an attempt at using the powerup
function activate_powerup_element(s: State): void {
  const entity_pb_line = document.getElementById("power_select")!;
  if (s.meta_state.power_up_activated) {
    entity_pb_line.setAttribute("style", `stroke: white; stroke-width: 1.5`);
  } else {
    entity_pb_line.setAttribute("style", `stroke: white; stroke-width: 0`);
  }
}

// This function will display the question mark in the ai gui to indicate the possession of a powerup
function activate_ai_powerup_symbol(s: State): void {
  // FIRST RESET BOTH
  const entity_pb_line = document.getElementById("ai_power_up_symbol")!;
  if (s.ai_paddle.power_up_holding !== power_up_type.none) {
    entity_pb_line.setAttribute("style", `stroke: white; stroke-width: 2`);
  } else {
    entity_pb_line.setAttribute("style", `stroke: white; stroke-width: 0`);
  }
}


// Function will display the icon of the power_up the player is holding and if the player is not holding any power_up, it will hide all the icons
function show_power_up_holding_player(s: State): void {
  if (s.player_state.power_up_holding !== power_up_type.none) {
    const entity_pb = document.getElementById(
      `power_up_${s.player_state.power_up_holding}_symbol`
    )!;
    entity_pb.setAttribute("style", `visibility: visible`);
  } else {
    clear_powerup_box();
  }
}

// This loops and sets all the powerup icons to hidden
function clear_powerup_box(): void {

  // A function that will be hide the visibility of a power_up symbol based on input type
  const disable_power_up_element: (power_up_id: number) => void = (
    power_up_id: number
  ) => {
    const entity_pb = document.getElementById(
      `power_up_${power_up_id}_symbol`
    )!;
    entity_pb.setAttribute("style", `visibility: hidden`);
  };

  // Every power_up icon will be hidden
  [power_up_type.expand, power_up_type.health, power_up_type.return, power_up_type.speed].forEach(disable_power_up_element);
}

// Runs all three menu functions to display the menu based on each desired condition
function display_all_menus(state: State): void {
  displayMenu(
    MenuType.PauseMenu,
    state.meta_state.is_paused &&
    state.meta_state.has_started &&
    !(state.ai_score >= game_constants.MAX_SCORE || state.player_score >= game_constants.MAX_SCORE)
  );

  displayMenu(
    MenuType.StartMenu,
    state.meta_state.is_paused && !state.meta_state.has_started
  );

  displayMenu(
    MenuType.EndMenu,
    state.meta_state.is_paused &&
    (state.ai_score >= game_constants.MAX_SCORE || state.player_score >= game_constants.MAX_SCORE)
  );
}

// For all the entities that will be rendered, it will update their position and size
function update_all_entity(state: State): void {
  const pos_size_getter = get_position_size(state);
  rendered_entities.map(update_entity(pos_size_getter));
}

// This function updates the player and ai score on the display by calling update GUI on each player_type
function update_both_score(state: State): void {
  const score_getter = get_side_score(state);
  update_score_GUI(score_getter)(Player_type.CONTROLLED_PLAYER);
  update_score_GUI(score_getter)(Player_type.AI);
}

// ! HAS SIDE EFFECTS
// The main update view function that will be ran in the subscribe all
function updateView(state: State): void {
  display_all_menus(state);

  //makes game slightly fast as elements aren't being updated when paused
  if (!state.meta_state.is_paused) {

    const update_functions: Array<(State) => void> = [update_all_entity, activate_powerup_element, power_ball_show, show_power_up_holding_player, activate_ai_powerup_symbol, activate_ai_powerup_symbol, update_both_score]

    apply_value_to_all(update_functions, state)

  } else if (!state.meta_state.has_started) {
    resetWinText();
    reset_score();
  } else if (state.meta_state.has_ended) {
    updateWinText(state.player_score < state.ai_score);
  }
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
      merge(
        startUpMove,
        StartDownMove,
        StopUpMove,
        StopDownMove,
        PauseGame,
        mouseObs,
        StartPowerUpUse,
        EndPowerUpUse
      ),
      scan(reduceState, initialState)
    )
    .subscribe(updateView);
}

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != "undefined")
  window.onload = () => {
    pong();
  };
