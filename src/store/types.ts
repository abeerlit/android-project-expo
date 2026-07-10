import { DirectoryState } from "store/directory/reducers.ts";
import { AuthState } from "store/authentication/reducers.ts";
import { PermissionState } from "store/permissions/reducers.ts";
import { UserState } from "store/users/reducers.ts";
import { TextState } from "store/text/reducers.ts";
import { SendbirdState } from "store/sendbird/reducers.ts";

export interface State {
  authReducer: AuthState;
  permissionsReducer: PermissionState;
  rootReducer: { pushToken?: string; sentryExceptionEventId?: string };
  directoryReducer: DirectoryState;
  userReducer: UserState;
  textReducer: TextState;
  sendbirdReducer: SendbirdState;
}
