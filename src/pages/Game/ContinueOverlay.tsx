import * as React from "react";
import {useTranslation} from "react-i18next";

export const ContinueOverlay: React.FC<{visible: boolean; onClick: () => void}> = ({visible, onClick}) => {
  const {t} = useTranslation();

  return (
    <button
      type="button"
      aria-label={t("resume_game")}
      onClick={onClick}
      data-testid="continue-overlay"
      className={`${visible ? "flex" : "hidden"} group absolute z-30 h-full w-full items-center justify-center border-0 bg-transparent p-0 hover:cursor-pointer focus:outline-none`}
    >
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-teal-500 transition-transform duration-200 ease-out hover:scale-110 group-focus-visible:scale-110 group-focus-visible:ring-4 group-focus-visible:ring-teal-300 group-focus-visible:ring-offset-4 group-focus-visible:ring-offset-gray-900">
        <div className="absolute w-0 h-0 border-l-[30px] border-l-white border-t-[20px] border-t-transparent border-b-[20px] border-b-transparent translate-x-[5px]" />
      </div>
    </button>
  );
};
