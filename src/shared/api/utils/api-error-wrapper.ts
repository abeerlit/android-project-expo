import { toast } from "@backpackapp-io/react-native-toast";

type OmniaError = {
  name: string;
  message: string;
  code: string;
  validationErrors: Array<string>;
};

export const handleApiError = (error: OmniaError, options = {}) => {
  // If our error is not an object / not an OmniaError, we'll just show the error message
  if (!error || typeof error !== "object") {
    toast.error(`Error: ${error}`, options);
    return;
  }

  const errorObj = error;

  // If we have validationErrors from zod, let's list those out to the user
  if (
    errorObj.validationErrors &&
    Array.isArray(errorObj.validationErrors) &&
    errorObj.validationErrors.length > 0
  ) {
    errorObj.validationErrors.forEach((validationError: string) => {
      toast.error(`Validation Error: ${validationError}`, options);
    });
  } else {
    // Otherwise, we'll show them the basic error message

    const errorMessage = errorObj.message || "An unknown error occurred";
    toast.error(`Error: ${errorMessage}`, options);
  }
};
