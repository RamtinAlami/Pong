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

// THIS SECTION WILL BE USED FOR DECLARING TYPES AND CLASSES
type Paddle_state = Readonly<{
  y: number;
  x: number;
  speed: number;
  size: number;
  direction: number;
}>;

type heuristic_ball = ball_state | null;

type player_state = Readonly<{
  paddle: Paddle_state;
  // power_up_holding: number;
  // activated_powerup: some_type_of_class_with_duration;
}>;

type ai_state = Readonly<{
  paddle: Paddle_state;
  y_target: number;
  heuristic_ball: heuristic_ball;
  // power_up_holding: number;
  // activated_powerup: some_type_of_class_with_duration;
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
}>;

type Meta_State = Readonly<{
  difficulty: number;
  has_started: boolean;
  is_paused: boolean;
  show_active_line: boolean;
  has_ended: boolean;
  rand_seed: number;
  button_clicked: number; // 0 is none, 1,2,3 are options
}>;

type State = Readonly<{
  player_paddle: Paddle_state;
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
   * @param {number} magnitude The magnitude of the vector
   * @param {number} angle The angle in radians
   */
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
  y_reflect_paddle = (strength: number) => {
    const new_mag = this.magnitude * strength;
    // Only change the angle if strength a lot more
    const new_angle = -(this.angle + (strength > 1 ? strength : 0));
    return new Vector(this.magnitude, -this.angle);
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

const initial_ai_state: ai_state = {
  paddle: initial_ai_paddle_state,
  y_target: 300,
  heuristic_ball: null,
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
  show_active_line: false,
  has_ended: false,
  button_clicked: 0,
  rand_seed: 1,
};

const initial_pb_state: power_up_ball_state = {
  y: 300,
  x: 300,
  velocity: new Vector(0.4, 1),
  is_active: true,
  ms_left_visible: 0,
};

const initialState: State = {
  player_paddle: initial_player_paddle_state,
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
  MAX_SCORE = 7,
}

// The following class are the event classes that will be constructed observables
class Tick {
  constructor(public readonly elapsed: number) {}
}
class move_player_paddle {
  constructor(public readonly direction: number) {}
}

class use_power_up {
  constructor(public readonly activated: boolean) {}
}

class mouse_click {
  constructor(public readonly x: number, public readonly y: number) {}
}

class pause {
  constructor() {}
}

//
type Event = "keydown" | "keyup";
type Key = "ArrowUp" | "ArrowDown" | "Space" | "Escape";
const observeKey = <T>(eventName: string, k: Key, result: () => T) =>
  fromEvent<KeyboardEvent>(document, eventName).pipe(
    filter(({ code }) => code === k),
    filter(({ repeat }) => !repeat),
    map(result)
  );

const observeMouse = <T>(result: (clientX: number, clientY: number) => T) =>
  fromEvent<MouseEvent>(document, "mousedown").pipe(
    map(({ clientX, clientY }) => result(clientX, clientY))
  );

const startUpMove = observeKey(
  "keydown",
  "ArrowUp",
  () => new move_player_paddle(-1)
);
const StartDownMove = observeKey(
  "keydown",
  "ArrowDown",
  () => new move_player_paddle(1)
);
const StopUpMove = observeKey(
  "keyup",
  "ArrowUp",
  () => new move_player_paddle(0)
);
const StopDownMove = observeKey(
  "keyup",
  "ArrowDown",
  () => new move_player_paddle(0)
);

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

const PauseGame = observeKey("keydown", "Escape", () => new pause());

const mouseObs = observeMouse((x, y) => new mouse_click(x, y));

// NEED TO COMBINED TWO INTO ONE AND USE TYPE
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

const get_new_player_y: (direction: number) => (s: State) => number = (
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

// LCG using GCC's constants
// ! BASED ON WEEK 5 OBSERVABLES.TS
const psudo_randm: (seed: number) => number = (seed: number) => {
  return ((1103515245 * seed + 12345) % 0x80000000) / (0x80000000 - 1);
};

// ! returns 1 or 2 or 3 for buttons, and returns 0 for others
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

// sets seed to mouse x ** y position
// to be used at the start
function set_seed(s: State, x: number, y: number): State {
  return { ...s, meta_state: { ...s.meta_state, rand_seed: x + y } };
}

// Standard Normal variate using Box-Muller transform.
function randn_bm(seed: number, variance: number, mean: number): number {
  const u = psudo_randm(seed);
  const v = psudo_randm(seed + 1); // need to change the seed
  // standard normal dist
  const Z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

  // convert standard normal to our case
  const X = variance * Z + mean;
  return X;
}

const prediction_deviation: (s: State) => number = (s: State) => {
  const player_help = 0.5 * (1 / (1 + Math.exp(s.ai_score - 4))) + 0.05; // as the player scores they get less help
  const ai_help = 0.35 * (1 / (1 + Math.exp(-s.player_score + 4))); // as the player scores they get less help
  const variance = (player_help + ai_help) * (90 / s.meta_state.difficulty); // 1, 2 or 3
  const generated_number = randn_bm(s.meta_state.rand_seed, variance, 0);
  return generated_number;
};

type EventType = move_player_paddle | Tick | pause | mouse_click | use_power_up;

// used for keyboard to update
function move_player_paddle_func(s: State, e: EventType): State {
  if (!(e instanceof move_player_paddle)) throw "Wrong Type";
  return {
    ...s,
    player_paddle: {
      ...s.player_paddle,
      direction: e.direction,
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
    // ! TODO FIX THIS
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
      show_active_line: e.activated,
    },
  };
}

const move_player_tick_function: (s: State) => State = (s: State) => {
  const new_player_y: number = get_new_player_y(s.player_paddle.direction)(s);
  return {
    ...s,
    player_paddle: {
      ...s.player_paddle,
      y: new_player_y,
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

function find_ai_target_tick_function(s: State): State {
  const new_player_y: number = get_new_player_y(s.player_paddle.direction)(s);
  return {
    ...s,
    ai_paddle: {
      ...s.ai_paddle,
      y_target:
        s.ai_paddle.y_target > 540
          ? 539
          : s.ai_paddle.y_target < 0
          ? 0
          : s.ai_paddle.heuristic_ball !== null
          ? s.ai_paddle.heuristic_ball.x < 40
            ? s.ai_paddle.heuristic_ball.y - 40 + prediction_deviation(s)
            : s.ai_paddle.y_target
          : s.ball.x < 40
          ? randn_bm(s.meta_state.rand_seed + 3, 250, 300)
          : s.ai_paddle.y_target,
    },
  };
}

function move_heuristic_ball_tick_function(s: State): State {
  const new_player_y: number = get_new_player_y(s.player_paddle.direction)(s);
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
  };
}

function move_ball_tick_function(s: State): State {
  // const new_player_y: number = get_new_player_y(s.player_paddle.direction)(s);
  return {
    ...s,
    ball:
      s.ball.x > 562 || s.ball.x < 34
        ? {
            ...s.ball,
            x: randn_bm(s.meta_state.rand_seed + 10, 50, 100),
            y: randn_bm(s.meta_state.rand_seed + 11, 50, 100),
            velocity: new Vector(
              initial_ball_State.velocity.magnitude,
              psudo_randm(s.meta_state.rand_seed + 13)
            ),
          }
        : {
            ...s.ball,
            x: s.ball.x + get_new_ball_velocity(s).dx,
            y: s.ball.y + get_new_ball_velocity(s).dy,
            velocity: get_new_ball_velocity(s),
          },
  };
}

function move_power_ball_tick_function(s: State): State {
  // const new_player_y: number = get_new_player_y(s.player_paddle.direction)(s);
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
  // const new_player_y: number = get_new_player_y(s.player_paddle.direction)(s);
  return {
    ...s,
    player_score: s.ball.x > 562 ? s.player_score + 1 : s.player_score,
    ai_score: s.ball.x < 34 ? s.ai_score + 1 : s.ai_score,
  };
}

// TODO SET THE 1000 to a constant that is max_rand_num_get
function update_seed_tick_function(s: State): State {
  return {
    ...s,
    meta_state: {
      ...s.meta_state,
      rand_seed: (s.meta_state.rand_seed + 97) % 100000000000,
    },
  };
}

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
    find_ai_target_tick_function,
    move_heuristic_ball_tick_function,
    move_ball_tick_function,
    move_power_ball_tick_function,
    update_score_tick_function,
    update_seed_tick_function,
    check_end_game_tick_function,
  ];

  // if game is paused, then tick functions is not performed to preserve state
  const new_state = s.meta_state.is_paused
    ? s
    : tick_functions.reduce((v, f) => f(v), s);

  return new_state;
}

// TODO FIX THIS TO OLD IF STATEMENT VERSION
const reduceState = (s: State, e: EventType): State => {
  switch (e.constructor) {
    case mouse_click:
      return mouse_click_func(s, e);
      break;
    case use_power_up:
      return activate_power_ball(s, e);
      break;
    case move_player_paddle:
      return move_player_paddle_func(s, e);
      break;
    case pause:
      return pause_func(s, e);
      break;
    case Tick:
      return Tick_func(s, e);
      break;
    default:
      return s;
      break;
  }
};

// TURN THIS INTO A SMALLER RESULABLES ONE BY COMBINING TWO
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

function get_new_power_ball_velocity(s: State): Vector {
  return s.power_up_ball.x <= 100 || s.power_up_ball.x >= 400
    ? s.power_up_ball.velocity.x_reflect()
    : s.power_up_ball.y <= 100 || s.ball.y >= 400
    ? s.power_up_ball.velocity.y_reflect()
    : s.power_up_ball.velocity;
}

// SET THIS UP INTO ONE
function get_new_ball_velocity(s: State): Vector {
  return s.ball.x <= 5 || s.ball.x >= 600 || collision_with_paddle(s)
    ? s.ball.velocity.x_reflect()
    : s.ball.y <= 5 || s.ball.y >= 600
    ? s.ball.velocity.y_reflect()
    : s.ball.velocity;
}

function get_new_ball_velocity_ai(s: State): Vector {
  return s.ai_paddle.heuristic_ball.x <= 5 ||
    s.ai_paddle.heuristic_ball.x >= 600 ||
    collision_with_paddle(s)
    ? s.ai_paddle.heuristic_ball.velocity.x_reflect()
    : s.ai_paddle.heuristic_ball.y <= 5 || s.ai_paddle.heuristic_ball.y >= 600
    ? s.ai_paddle.heuristic_ball.velocity.y_reflect()
    : s.ai_paddle.heuristic_ball.velocity;
}

// The following functions have side effects
const enum Player_type {
  CONTROLLED_PLAYER,
  AI,
}

// TODO EXPLAIN THIS
const enum Ent_type {
  CONTROLLED_PLAYER = "player_paddle",
  AI = "cpu_paddle",
  main_ball = "ball",
  heuristic_ball = "ai_heuristic_ball",
}

// for debugging, can add more
const rendered_entities: Array<Ent_type> = [
  Ent_type.CONTROLLED_PLAYER,
  Ent_type.AI,
  Ent_type.main_ball,
];

// TODO WRITE DOCUMENTATION FOR THIS AND HOW I HAVE TO CHANGE ONE PLACE AS MY STATE EVOLVES
const get_position_size: (
  s: State
) => (entity_type: Ent_type) => { x: number; y: number; size: number } = (
  s: State
) => (entity_type: Ent_type) => {
  switch (entity_type) {
    case Ent_type.CONTROLLED_PLAYER:
      return {
        x: s.player_paddle.x,
        y: s.player_paddle.y,
        size: s.player_paddle.size,
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
    default:
      // TODO ERROR
      throw new Error("Something bad happened");
  }
};

// TODO ADD DOCUMENTATION
// ! HAS SIDE EFFECTS
const apply_svg_transform: (
  entity_type: Ent_type
) => (x: number) => (y: number) => (scale: number) => void = (
  entity_type: Ent_type
) => (x: number) => (y: number) => (scale: number) => {
  const entity = document.getElementById(entity_type)!;
  entity.setAttribute("transform", `translate(${x},${y}) scale(${scale})`);
};

// TODO DOCUMENTATION THE FIRST INPUT IS POSITION GETTER
// ! HAS SIDE EFFECTS
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

const get_side_score: (s: State) => (side: Player_type) => number = (
  s: State
) => (side: Player_type) => {
  switch (side) {
    case Player_type.CONTROLLED_PLAYER:
      return s.player_score;
      break;
    case Player_type.AI:
      return s.ai_score;
      break;
    default:
      throw new Error("Something bad happened");
      break;
  }
};

// TODO WRITE DOCO ON TO WHY THIS?
const get_score_ui_prefix: (side: Player_type) => string = (
  side: Player_type
) => (side == Player_type.AI ? "ai_ui_score_" : "player_ui_score_");

// ! HAS SIDE EFFECTS
const update_score_GUI: (
  get_score: (side: Player_type) => number
) => (side: Player_type) => void = (
  get_score: (side: Player_type) => number
) => (side: Player_type) => {
  const score = get_score(side);
  const html_score_id_prefix = get_score_ui_prefix(side);
  if (score > 0 && score <= 7) {
    const ui_score_object = document.getElementById(
      html_score_id_prefix + String(score)
    )!;
    ui_score_object.setAttribute("fill", `white`);
  }
};

// TODO TEST THIS BOI
// TODO REPLACE 7 WITH MAX SCORE
// ! HAS SIDE EFFECTS
function reset_score(): void {
  // TODO WRITE SOME DOCO AND RECURSIVE NATURE
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

  reset_score_aux(get_score_ui_prefix(Player_type.CONTROLLED_PLAYER))(7);
  reset_score_aux(get_score_ui_prefix(Player_type.AI))(7);
}

const enum MenuType {
  PauseMenu = "pauseMenu",
  EndMenu = "EndGameMenu",
  StartMenu = "startMenu",
}

function displayMenu(m: MenuType, display: boolean): void {
  const entity = document.getElementById(m)!;
  if (display) {
    entity.setAttribute("style", `visibility: visible`);
  } else {
    entity.setAttribute("style", `visibility: hidden`);
  }
}

// ! HAS SIDE EFFECT
function updateWinText(player_won: boolean): void {
  // FIRST RESET BOTH

  // SET THE RIGHT ONE
  const html_tag_text_winner = player_won ? "end_win" : "end_lose";
  const entity = document.getElementById(html_tag_text_winner)!;
  entity.setAttribute("style", `visibility: visible`);
}

// ! HAS SIDE EFFECTS
function resetWinText(): void {
  // FIRST RESET BOTH
  const entity_win = document.getElementById("end_win")!;
  entity_win.setAttribute("style", `visibility: hidden`);
  const entity_lose = document.getElementById("end_lose")!;
  entity_lose.setAttribute("style", `visibility: hidden`);
}

// ! HAS SIDE EFFECTS
function power_ball_move(s: State): void {
  // FIRST RESET BOTH
  const entity_pb = document.getElementById("power_box")!;
  if (s.power_up_ball.is_active) {
    entity_pb.setAttribute("style", `visibility: visible`);
    entity_pb.setAttribute(
      "transform",
      `translate(${s.power_up_ball.x}, ${s.power_up_ball.y})`
    );
  } else {
    entity_pb.setAttribute("style", `visibility: hidden`);
  }
}

// ! HAS SIDE EFFECTS
let test = false;
function show_power_up_line(s: State): void {
  // FIRST RESET BOTH
  const entity_pb = document.getElementById("power_select")!;
  if (s.meta_state.show_active_line && !test) {
    console.log("dlksajnda");
    test = true;
    entity_pb.setAttribute("style", `visibility: visible`);
  } else {
    test = false;
    entity_pb.setAttribute("style", `visibility: hidden`);
  }
}

// ! HAS SIDE EFFECTS
function updateView(state: State): void {
  // TODO turn these three into one function
  displayMenu(
    MenuType.PauseMenu,
    state.meta_state.is_paused &&
      state.meta_state.has_started &&
      !(state.ai_score >= 7 || state.player_score >= 7)
  );

  displayMenu(
    MenuType.StartMenu,
    state.meta_state.is_paused && !state.meta_state.has_started
  );

  displayMenu(
    MenuType.EndMenu,
    state.meta_state.is_paused &&
      (state.ai_score >= 7 || state.player_score >= 7)
  );

  //makes game slightly fast
  if (!state.meta_state.is_paused) {
    const pos_size_getter = get_position_size(state);
    // TODO CONVERT NORMAL FUNCTION TO UNARY
    rendered_entities.map(update_entity(pos_size_getter));
    power_ball_move(state);
    show_power_up_line(state);

    // ONLY TWO ENTITIES THUS NOT WORTH MAKING LIST
    const score_getter = get_side_score(state);
    update_score_GUI(score_getter)(Player_type.CONTROLLED_PLAYER);
    update_score_GUI(score_getter)(Player_type.AI);
  } else if (!state.meta_state.has_started) {
    resetWinText();
    reset_score();
  } else if (state.meta_state.has_ended) {
    updateWinText(state.player_score < state.ai_score);
  }
}

function reset_display(): void {}

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
