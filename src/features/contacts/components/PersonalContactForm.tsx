// React Imports
import { useFormik } from "formik";
import { useQueryClient } from "@tanstack/react-query";
import {
  createPersonalContact,
  getPersonalContactById,
  patchPersonalContact,
  removePersonalContactAvatar
} from "shared/api/directory/methods.ts";
import { useSelector } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";
import { isValidEmail } from "shared/utils/utils.ts";
import { useCallback, useEffect, useState } from "react";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import {
  AsYouType,
  parsePhoneNumberFromString,
  type PhoneNumber
} from "libphonenumber-js";

// Type Imports
import React from "react";
import { State } from "store/types.ts";
import { FieldInputProps } from "formik";

// Component Imports
import Icon from "shared/components/Icon.tsx";
import { Field, FormikProvider } from "formik";
import { Logger } from "shared/utils/Logger.ts";
import { Text } from "shared/components/Text.tsx";
import { Button } from "shared/components/Button.tsx";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";
import ImagePicker from "react-native-image-crop-picker";
import { TextInput } from "shared/components/TextInput.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { handleApiError } from "shared/api/utils/api-error-wrapper.ts";

type FormMode = "create" | "edit";

interface PersonalContactFormProps {
  context: FormMode;
  contactId?: number;
  onSubmit?: (values: FormValues) => void;
}

interface FormValues {
  name: string;
  number: string;
  email: string;
  company: string;
}

const DEFAULT_PHONE_REGION = "US";

/**
 * Pasted numbers often include international spacing (e.g. +1 251 785 3025).
 * For US / NANP +1 with a 10-digit national number, show (251) 785-3025.
 */
function formatPhoneNumberForDisplay(parsed: PhoneNumber): string {
  const national = (parsed.nationalNumber || "").replace(/\D/g, "");
  if (parsed.countryCallingCode === "1" && national.length === 10) {
    return parsed.formatNational();
  }
  return parsed.formatInternational();
}

function normalizePhoneInputToDigits(
  raw: string
): { display: string; digits: string; isValid: boolean } {
  const input = (raw ?? "").trim();
  if (!input) return { display: "", digits: "", isValid: false };

  const asYouType = new AsYouType(DEFAULT_PHONE_REGION);
  const typed = asYouType.input(input);
  const numberFromTyping = asYouType.getNumber();

  const parsed =
    numberFromTyping ??
    parsePhoneNumberFromString(
      input,
      input.startsWith("+") ? undefined : DEFAULT_PHONE_REGION
    );

  if (parsed) {
    const digits = parsed.number.replace(/^\+/, "");
    const display = formatPhoneNumberForDisplay(parsed);
    return { display, digits, isValid: parsed.isValid() };
  }

  const digitsOnly = typed.replace(/\D/g, "");
  // If the user entered a US national number without country code, store as +1...
  const digits =
    digitsOnly.length === 10 ? `1${digitsOnly}` : digitsOnly.slice(0, 15);
  return { display: typed || input, digits, isValid: false };
}

function digitsToDisplay(digits: string): string {
  const d = (digits ?? "").replace(/\D/g, "");
  if (!d) return "";
  const e164ish = d.length === 10 ? `+1${d}` : `+${d}`;
  const p = parsePhoneNumberFromString(e164ish);
  return p ? formatPhoneNumberForDisplay(p) : e164ish;
}

export const PersonalContactForm = ({
  context,
  contactId,
  onSubmit
}: PersonalContactFormProps) => {
  // Constants
  const logger = new Logger("Personal Contact Form: ");

  // Hooks
  const theme = useTheme();
  const queryClient = useQueryClient();

  // App State
  const token = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );

  // Local State
  const [loading, setLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState("");
  const [newImageSrc, setNewImageSrc] = useState("");
  const [originalImageSrc, setOriginalImageSrc] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");

  const formik = useFormik<FormValues>({
    initialValues: { name: "", number: "", email: "", company: "" },

    validate: ({ name, number, email }) => {
      const validationErrors: Partial<FormValues> = {};

      // Simple Validation
      if (!name) {
        validationErrors.name = "Name is required";
      }

      if (!number) {
        validationErrors.number = "Phone number is required";
      } else if (number.length > 15) {
        validationErrors.number = "Phone number is too long";
      }

      if (email && !isValidEmail(email)) {
        validationErrors.email = "Email is invalid";
      }

      return validationErrors;
    },

    onSubmit: async ({ name, number, email, company }) => {
      setLoading(true);
      try {
        const formData = new FormData();

        const normalized = normalizePhoneInputToDigits(phoneDisplay || number);
        const finalDigits = normalized.digits || number;

        formData.append("name", name);
        formData.append("number", finalDigits);
        formData.append("email", email ? email : "");
        formData.append("company", company ? company : "");
        formData.append("favorite", 0);

        // Handle avatar removal: if there was an original avatar but now it's cleared
        const shouldRemoveAvatar =
          context === "edit" && originalImageSrc && !imageSrc && !newImageSrc;

        if (shouldRemoveAvatar) {
          await removePersonalContactAvatar(token, contactId!, formData);
        }

        // Handle avatar upload
        if (
          (context === "create" && imageSrc) ||
          (context === "edit" && newImageSrc)
        ) {
          formData.append("avatar", {
            uri: context === "create" ? imageSrc : newImageSrc,
            type: "image/jpeg",
            name: "avatar.jpg"
          });
        }

        await (context === "create"
          ? createPersonalContact(token, formData)
          : patchPersonalContact(token, contactId!, formData));

        setLoading(false);
        formik.resetForm();
        setImageSrc("");
        setNewImageSrc("");
        setOriginalImageSrc("");
        setPhoneDisplay("");

        await queryClient.invalidateQueries({ queryKey: ["personalContacts"] });

        if (onSubmit) {
          onSubmit({ name, number: finalDigits, email, company });
        }
      } catch (error: any) {
        handleApiError(error);
        setLoading(false);
      }
    }
  });

  const handleUploadMedia = () => {
    ImagePicker.openPicker({
      width: 300,
      height: 300,
      cropping: true
    }).then((image) => {
      setImageSrc(image.path);

      if (context === "edit") {
        setNewImageSrc(image.path);
      }
    });
  };

  const handleRemoveAvatar = () => {
    setImageSrc("");
    setNewImageSrc("");
  };

  const submit = useCallback(() => {
    if (loading) {
      return;
    }
    formik.handleSubmit();
  }, [formik.handleSubmit, loading]);

  useEffect(() => {
    const fetchContact = async () => {
      if (context === "edit" && contactId) {
        try {
          const contact = await getPersonalContactById(token, contactId);

          // Populate form with existing data
          formik.setValues({
            name: contact.name || "",
            number: contact.number || "",
            email: contact.email || "",
            company: contact.company || ""
          });
          setPhoneDisplay(digitsToDisplay(contact.number || ""));

          setImageSrc(contact.avatarThumbnailPath || "");
          setOriginalImageSrc(contact.avatarThumbnailPath || "");
        } catch (error) {
          logger.error("Failed to fetch contact:", error);
        }
      }
    };

    fetchContact();
  }, [contactId, context]);

  return (
    <View style={{ paddingHorizontal: padding["3xl"] }}>
      <WhiteSpace height={3} />

      <Text
        size={fontSize.lg}
        style={{
          fontWeight: "600",
          marginBottom: 20,
          color: theme.colors["color-colors-text-text-primary"],
          borderColor: theme.colors["color-colors-border-border-secondary"]
        }}
      >
        {context === "create" ? "Add Contact" : "Edit Contact"}
      </Text>

      <WhiteSpace height={20} />

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        {imageSrc ? (
          <View style={styles.avatarContainer}>
            <Image source={{ uri: imageSrc }} style={styles.avatarImage} />
            <TouchableOpacity
              onPress={handleRemoveAvatar}
              activeOpacity={0.7}
              style={[
                styles.removeButton,
                {
                  backgroundColor:
                    theme.colors["color-colors-background-bg-primary"],
                  borderColor:
                    theme.colors["color-colors-foreground-fg-error-primary"]
                }
              ]}
            >
              <Icon
                name={"trash-01"}
                size={14}
                style={{
                  color:
                    theme.colors["color-colors-foreground-fg-error-primary"]
                }}
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              {
                borderColor:
                  theme.colors[
                    "component-colors-components-avatars-avatar-contrast-border"
                  ],
                backgroundColor:
                  theme.colors["component-colors-components-avatars-avatar-bg"]
              },
              styles.defaultAvatarContainer
            ]}
          >
            <Icon
              name={"user-01"}
              size={32}
              style={{
                color: theme.colors["color-colors-foreground-fg-quarterary"]
              }}
            />
          </View>
        )}

        <Button
          onPress={handleUploadMedia}
          iconSpacing={5}
          type={"outline"}
          icon={<Icon name={"upload-cloud-02"} size={16} />}
          style={{ width: "50%" }}
        >
          Upload Photo
        </Button>
      </View>

      <WhiteSpace height={20} />

      <Text
        color={"colors-text-text-secondary"}
        size={14}
        weight={"regular"}
        align={"left"}
      >
        Contact Name*
      </Text>
      <WhiteSpace height={5} />
      <FormikProvider value={formik}>
        <Field name="name">
          {({ field }: { field: FieldInputProps<string> }) => (
            <View>
              <TextInput
                accessibilityLabel="Text input field"
                placeholderColor={"colors-text-text-placeholder"}
                autoCapitalize="none"
                autoCorrect={false}
                value={field.value}
                onChangeText={field.onChange("name")}
                onBlur={field.onBlur("name")}
                textContentType="name"
                autoComplete="name"
                returnKeyType="done"
                returnKeyLabel="Create"
                enablesReturnKeyAutomatically={true}
              />
              {formik.touched.name && formik.errors.name && (
                <View>
                  <WhiteSpace height={4} />
                  <Text color={"secondary"} size={12} align={"left"}>
                    {formik.errors.name}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Field>
        <WhiteSpace height={17} />
        <Text size={14} weight={"regular"} align={"left"}>
          Phone Number*
        </Text>
        <WhiteSpace height={5} />
        <Field name="number">
          {({ field }: { field: FieldInputProps<string> }) => (
            <View>
              <TextInput
                accessibilityLabel="Text input field"
                placeholderColor={"colors-text-text-placeholder"}
                autoCapitalize="none"
                autoCorrect={false}
                value={phoneDisplay}
                onChangeText={(text) => {
                  const normalized = normalizePhoneInputToDigits(text);
                  setPhoneDisplay(normalized.display);
                  field.onChange("number")(normalized.digits);
                }}
                onBlur={field.onBlur("number")}
                textContentType="telephoneNumber"
                keyboardType="phone-pad"
                // Allow paste of formatted numbers; we normalize in onChangeText.
                maxLength={32}
                returnKeyType="done"
                returnKeyLabel="Create"
                enablesReturnKeyAutomatically={true}
              />
              {formik.touched.number && formik.errors.number && (
                <View>
                  <WhiteSpace height={4} />
                  <Text color={"secondary"} size={12} align={"left"}>
                    {formik.errors.number}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Field>
        <WhiteSpace height={17} />
        <Text size={14} weight={"regular"} align={"left"}>
          Email
        </Text>
        <WhiteSpace height={5} />
        <Field name="email">
          {({ field }: { field: FieldInputProps<string> }) => (
            <View>
              <TextInput
                accessibilityLabel="Text input field"
                placeholderColor={"colors-text-text-placeholder"}
                autoCapitalize="none"
                autoCorrect={false}
                value={field.value}
                onChangeText={field.onChange("email")}
                onBlur={field.onBlur("email")}
                autoComplete="email"
                returnKeyType="done"
                returnKeyLabel="Login"
                enablesReturnKeyAutomatically={true}
              />
              {formik.touched.email && formik.errors.email && (
                <View>
                  <WhiteSpace height={4} />
                  <Text color={"secondary"} size={12} align={"left"}>
                    {formik.errors.email}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Field>
        <WhiteSpace height={17} />
        <Text size={14} weight={"regular"} align={"left"}>
          Company
        </Text>
        <WhiteSpace height={5} />
        <Field name="company">
          {({ field }: { field: FieldInputProps<string> }) => (
            <View>
              <TextInput
                accessibilityLabel="Text input field"
                placeholderColor={"colors-text-text-placeholder"}
                autoCapitalize="none"
                autoCorrect={false}
                value={field.value}
                onChangeText={field.onChange("company")}
                onBlur={field.onBlur("company")}
                returnKeyType="done"
                returnKeyLabel="Create"
                enablesReturnKeyAutomatically={true}
              />
              {formik.touched.company && formik.errors.company && (
                <View>
                  <WhiteSpace height={4} />
                  <Text color={"secondary"} size={12} align={"left"}>
                    {formik.errors.company}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Field>
        <WhiteSpace height={30} />
        <Button loading={loading} onPress={submit}>
          Save
        </Button>
      </FormikProvider>
      <WhiteSpace height={10} />
    </View>
  );
};

const styles = StyleSheet.create({
  defaultAvatarContainer: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    width: 64,
    height: 64
  },
  avatarContainer: {
    position: "relative"
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md
  },
  removeButton: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5
  }
});
