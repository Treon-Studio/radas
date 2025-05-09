import { useCallback, useState } from "@lynx-js/react";
import lynxLogo from "../assets/lynx-logo.png";
import reactLynxLogo from "../assets/react-logo.png";

const Header = () => {
  const [isReactLogo, setIsReactLogo] = useState(false);

  const handleLogoTap = useCallback(() => {
    "background-only";
    setIsReactLogo((prev) => !prev);
  }, []);

  return (
    <view>
      <view className="Banner">
        <view className="Logo" bindtap={handleLogoTap}>
          {isReactLogo ? (
            <image src={reactLynxLogo} className="Logo--react" />
          ) : (
            <image src={lynxLogo} className="Logo--lynx" />
          )}
        </view>
        <text className="HeaderTitle">Welcome</text>
        <text className="HeaderSubtitle">Lynx Native</text>
      </view>
    </view>
  );
};

export default Header;