import * as React from "react";

export const ContinueOverlay: React.FC<{visible: boolean; onClick: () => void}> = ({visible, onClick}) => (
  <div
    onClick={onClick}
    data-testid="continue-overlay"
    className={`${visible ? "flex" : "hidden"} justify-center items-center w-full h-full absolute z-30 hover:cursor-pointer`}
  >
    <div className="bg-teal-500 rounded-full w-20 h-20 flex justify-center items-center transition-transform duration-200 ease-out hover:scale-110 relative">
      <div className="absolute w-0 h-0 border-l-[30px] border-l-white border-t-[20px] border-t-transparent border-b-[20px] border-b-transparent translate-x-[5px]"></div>
    </div>
  </div>
);
