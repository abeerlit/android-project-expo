import { FormEncodedOptions } from "../client/types/types.ts";

export function urlEncodeData(
  data: Record<string, unknown>,
  opts = {} as FormEncodedOptions
): string {
  const {
    sorted,
    skipIndex,
    ignoreNull,
    skipBracket,
    useDot,
    whitespace = "+"
  } = opts;

  const encode = (value: string | number | boolean) =>
    encodeURIComponent(value);

  const keys = (obj: object, keyArr = Object.keys(obj)) =>
    sorted ? keyArr.sort() : keyArr;

  const filterJoin = (arr: string[]) =>
    arr
      .filter((e) => e)
      .join("&")
      .replace(/%20/g, whitespace);

  const objNest = (name: string, obj: Record<string, unknown>) =>
    filterJoin(
      keys(obj)
        .map((key) =>
          useDot
            ? nest(`${name}.${key}`, obj[key])
            : nest(`${name}[${key}]`, obj[key])
        )
        .filter((e): e is string => e !== null) // Filter out null values
    );

  const arrNest = (
    name: string,
    arr: unknown[],
    brackets = skipBracket ? "" : "[]"
  ): string =>
    arr.length
      ? filterJoin(
          arr
            .map((elem, index) =>
              skipIndex
                ? nest(name + brackets, elem)
                : nest(name + "[" + index + "]", elem)
            )
            .filter((e): e is string => e !== null) // Filter out null values
        )
      : encode(name + brackets);

  const setNest = (name: string, set: Set<unknown>) =>
    filterJoin(
      Array.from(set)
        .map((elem) => nest(name, elem))
        .filter((e): e is string => e !== null) // Filter out null values
    );

  const nest = (
    name: string,
    value: unknown,
    type = typeof value,
    f: string | null = null
  ): string | null => {
    if (value === f) f = ignoreNull ? f : encode(name) + "=" + f;
    else if (/string|number|boolean/.test(type))
      f = encode(name) + "=" + encode(value as string | number | boolean);
    else if (Array.isArray(value)) f = arrNest(name, value);
    else if (value instanceof Set) f = setNest(name, value);
    else if (type === "object")
      f = objNest(name, value as Record<string, unknown>);

    return f;
  };

  return (
    data &&
    filterJoin(
      keys(data)
        .map((key) => nest(key, data[key]))
        .filter((e): e is string => e !== null) // Filter out null values
    )
  );
}
