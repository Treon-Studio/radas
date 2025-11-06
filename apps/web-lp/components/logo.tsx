import { SVGProps } from "react";
import { cn } from "@/lib/utils";
export const Logo = (props: SVGProps<any>) => {
	return (
		<svg
  viewBox="0 0 680 680"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  className={cn("w-5 h-5", props.className)}
  {...props}
>
  <rect width="680" height="680" fill="#000" />
  <polygon points="90,420 170,340 590,220 510,300" fill="#FAF9F5" />
  <polygon points="590,260 510,340 90,560 170,480" fill="#FAF9F5" />
</svg>
	);
};
