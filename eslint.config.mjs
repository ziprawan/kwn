import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "data/**", "coverage/**"],
  },
  {
    rules: {
      // Dynamic user-uploaded condition images are served from /api/uploads/[filename]
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
