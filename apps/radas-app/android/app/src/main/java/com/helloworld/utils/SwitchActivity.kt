package com.helloworld.utils

import android.app.Activity
import android.os.Bundle
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.TemplateData
import java.io.IOException
import android.view.ViewGroup
import android.widget.ImageButton
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import android.widget.LinearLayout

/**
 * An Activity that hosts a LynxView and a back button.
 * This activity demonstrates how to integrate a LynxView into a standard Android layout.
 */
class SwitchActivity : Activity() {
    private lateinit var lynxView: LynxView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Create a LinearLayout to hold the LynxView and the back button
        val linearLayout = LinearLayout(this)
        linearLayout.orientation = LinearLayout.VERTICAL // Ensure vertical layout

        // Create the back button
        val backButton = ImageButton(this)
        backButton.setImageResource(android.R.drawable.ic_menu_revert) // Use a simple back arrow icon
        backButton.setBackground(null) // Remove background
        val backButtonParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        backButtonParams.setMargins(16, 16, 16, 16) // Add some margin
        linearLayout.addView(backButton, backButtonParams)

        backButton.setOnClickListener {
            finish() // Go back to the previous activity
        }

        // Build the LynxView
        lynxView = buildLynxView()
        val lynxViewParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0, // Use 0 for height and weight to control the proportion
            1f  // LynxView takes up most of the screen
        )
        linearLayout.addView(lynxView, lynxViewParams)



        // Set the content view to the LinearLayout
        setContentView(linearLayout)

        // Make sure the content doesn't render behind the status bar
        ViewCompat.setOnApplyWindowInsetsListener(linearLayout) { v, insets ->
            val controller = ViewCompat.getWindowInsetsController(v)
            controller?.show(WindowInsetsCompat.Type.statusBars())
            val insetsCompat = WindowInsetsControllerCompat(window, v)
            insetsCompat.isAppearanceLightStatusBars = true
            val statusBarInsets = insets.getInsets(WindowInsetsCompat.Type.statusBars())
            v.setPadding(0, statusBarInsets.top, 0, 0)
            insets
        }
        ViewCompat.requestApplyInsets(linearLayout)

        try {
            val array = this.assets.open("devtool_switch/switchPage/devtoolSwitch.lynx.bundle").readBytes()
            lynxView.renderTemplateWithBaseUrl(
                array,
                TemplateData.empty(),
                "devtool_switch/switchPage/devtoolSwitch.lynx.bundle"
            )
        } catch (e: IOException) {
            e.printStackTrace()
        }
    }

    private fun buildLynxView(): LynxView {
        val viewBuilder = LynxViewBuilder()
        viewBuilder.setTemplateProvider(Provider(this))
        return viewBuilder.build(this)
    }
}