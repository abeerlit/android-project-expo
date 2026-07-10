import * as authActions from "./actions.ts";
import { LoginResponse, MFAMode } from "shared/api/authentication/types.ts";
import { State } from "store/types.ts";
import createReducer from "store/utils/create-reducer.ts";
import { Logger } from "shared/utils/Logger.ts";

export interface MFASetupState {
  token: string;
  mode: MFAMode;
  phoneNumber?: string;
  email?: string;
  setup?: boolean;
}

export interface AuthState {
  isLoggedIn: boolean;
  accessToken: string;
  mfaSetupState?: MFASetupState;
}

const initialState: AuthState = {
  isLoggedIn: false,
  accessToken: "",
  mfaSetupState: undefined
};

const logger = new Logger("AuthReducer");

// @ts-expect-error Ignoring the type error because making it typesafe involves a lot of work when we already know it will be safe
export const authReducer = createReducer<AuthState, unknown>(initialState, {
  [authActions.LOGIN_SUCCESS](
    state: State["authReducer"],
    { payload }: { payload: LoginResponse }
  ) {
    logger.debug("LOGIN_SUCCESS", payload.accessToken);
    return {
      ...state,
      isLoggedIn: true,
      accessToken: payload.accessToken
    };
  },
  [authActions.LOG_OUT]() {
    logger.debug("LOG_OUT");
    return initialState;
  },
  [authActions.SET_MFA_SETUP_STATE](
    state: State["authReducer"],
    { payload }: { payload: MFASetupState }
  ) {
    logger.debug("SET_MFA_SETUP_STATE", payload);
    return {
      ...state,
      mfaSetupState: payload
    };
  },
  [authActions.CLEAR_MFA_SETUP_STATE](state: State["authReducer"]) {
    logger.debug("CLEAR_MFA_SETUP_STATE");
    return {
      ...state,
      mfaSetupState: undefined
    };
  }
});
