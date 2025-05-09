package com.helloworld

import com.helloworld.utils.AppResourceFetcher
import com.helloworld.utils.DevMenuHandler
import com.helloworld.utils.GenericResourceFetcher
import com.helloworld.utils.Provider
import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import com.lynx.tasm.LynxBooleanOption
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.TimingHandler
import android.util.Log

/**
 * Main Activity for the application.
 * This activity hosts the LynxView and handles debug functionalities.
 */
class MainActivity : Activity() {

    private val extraTimingInfo = TimingHandler.ExtraTimingInfo()
    private lateinit var devMenuHandler: DevMenuHandler
    private lateinit var lynxView: LynxView

    /**
     * Called when the activity is first created.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize debug timing information if in debug mode
        if (BuildConfig.DEBUG) {
            extraTimingInfo.apply {
                mOpenTime = System.currentTimeMillis()
                mContainerInitStart = System.currentTimeMillis()
            }
        }

        // Build and set the LynxView
        lynxView = buildLynxView()
        setContentView(lynxView)

        // Reload LynxView and set timing info if in debug mode
        if (BuildConfig.DEBUG) {
            reloadLynxView()

            extraTimingInfo.apply {
                mPrepareTemplateEnd = System.currentTimeMillis()
                mContainerInitEnd = System.currentTimeMillis()
            }
            lynxView.setExtraTiming(extraTimingInfo)
        }

        // Initialize the DevMenuHandler
        devMenuHandler = DevMenuHandler(this)
    }

    /**
     * Builds a LynxView instance.
     * @return LynxView
     */
    private fun buildLynxView(): LynxView {
        val viewBuilder = LynxViewBuilder()

        // Configure view builder based on debug or release mode
        if (BuildConfig.DEBUG) {
            val sharedPref = getPreferences(MODE_PRIVATE)
            val isFastRefreshEnabled = sharedPref.getBoolean("fastRefreshEnabled", true)

            // In debug mode, enable generic and template resource fetchers

            viewBuilder.apply {
                setEnableGenericResourceFetcher(LynxBooleanOption.TRUE)
                setTemplateResourceFetcher(AppResourceFetcher())
                if (isFastRefreshEnabled) {
                    setGenericResourceFetcher(GenericResourceFetcher())
                }
            }
        } else {
            // In release mode, set template provider
            viewBuilder.setTemplateProvider(Provider(this))
        }

        return viewBuilder.build(this)
    }

    /**
     * Listens for physical key press events.
     * @param keyCode Key code
     * @param event KeyEvent
     * @return Boolean
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        return devMenuHandler.onKeyDown(keyCode, event)
    }

    /**
     * Reloads the LynxView with the debug URL.
     */
    fun reloadLynxView() {
        val lynxUrl = getLynxDebugUrl()
        lynxUrl?.let {
            Log.d("MainActivity", "LynxView rendered with URL: $it")
            lynxView.renderTemplateUrl(it, "")
        }
    }

    /**
     * Retrieves the Lynx debug URL from shared preferences.
     * If not found, sets a default URL.
     * @return The Lynx debug URL.
     */
    private fun getLynxDebugUrl(): String? {
        val sharedPref = getPreferences(MODE_PRIVATE)
        var lynxDebugUrl = sharedPref.getString("lynxDebugUrl", null)
        Log.d("MainActivity", "Retrieved lynxDebugUrl from preferences: $lynxDebugUrl")

        // If URL is null, set a default value
        if (lynxDebugUrl == null) {
            lynxDebugUrl = "http://localhost:3000/main.lynx.bundle?fullscreen=true"
            sharedPref.edit().putString("lynxDebugUrl", lynxDebugUrl).apply()
            Log.d("MainActivity", "lynxDebugUrl was null, set to default: $lynxDebugUrl")
        }

        return lynxDebugUrl
    }
}
