export function VideoPreview() {
    return (
        <div className="h-full w-full" style={{ opacity: 1, transform: 'none' }}>
            <hr className="border-dashed border-border w-full" />
            {/* Video Container - Full Width, No Padding */}
            <div className="relative w-full aspect-video bg-black">
                {/* Video Element */}
                <video
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                >
                    <source src="https://opencode.ai/_build/assets/opencode-min-CiEsORKQ.mp4" type="video/mp4" />
                    Your browser does not support the video tag.
                </video>
            </div>
        </div>
    )
}
