export interface Action<T = unknown> {
  type: string;
  payload?: T;
}

type Handlers<S, A extends Action> = {
  [key: string]: (state: S, action: A) => S;
};

export default function createReducer<S, A extends Action>(
  initialState: S,
  handlers: Handlers<S, A>
) {
  return function reducer(state: S = initialState, action: A): S {
    if (Object.prototype.hasOwnProperty.call(handlers, action.type)) {
      return handlers[action.type](state, action);
    } else {
      return state;
    }
  };
}
