import * as React from "react";
import {useTranslation} from "react-i18next";

import {Container} from "src/components/Layout";

// Task 11 replaces this route placeholder with the complete shared-game controller.
export default function MultiplayerGame() {
  const {t} = useTranslation();

  return (
    <Container className="flex min-h-screen items-center justify-center text-white">
      <p>{t("multiplayer_reconnecting")}</p>
    </Container>
  );
}
