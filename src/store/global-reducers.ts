/*
 * combines all th existing reducers
 */
import { authReducer } from "store/authentication/reducers.ts";
import { directoryReducer } from "store/directory/reducers.ts";
import { userReducer } from "store/users/reducers.ts";
import { textReducer } from "store/text/reducers.ts";
import { sendbirdReducer } from "store/sendbird/reducers.ts";
// import { chatReducerReducer } from "@features/home/reducer";
// import { permissionsReducer } from "@features/permissions/reducers";
// import { preferencesReducer } from "@features/preferences/reducer";
// import { keypadReducer } from "@features/dialer/reducers";
// import { alertsReducer } from "./alertsReducer";
// import { textChatReducer } from "@features/specialChat/reducer";

export default {
  authReducer,
  directoryReducer,
  userReducer,
  textReducer,
  sendbirdReducer
};
