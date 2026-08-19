/**
 * Redux saga class init
 * Import every feature saga here
 */
import { all } from "redux-saga/effects";
import { directorySagas } from "store/directory/sagas.ts";
import { authSagas } from "store/authentication/sagas.ts";
import { userSagas } from "store/users/sagas.ts";
import { textSagas } from "store/text/sagas.ts";

export default function* rootSaga() {
  yield all([...authSagas, ...directorySagas, ...userSagas, ...textSagas]);
}
