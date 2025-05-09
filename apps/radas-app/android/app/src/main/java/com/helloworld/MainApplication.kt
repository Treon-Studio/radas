package com.helloworld

import android.app.Application
import android.util.Log
import com.facebook.drawee.backends.pipeline.Fresco
import com.facebook.imagepipeline.core.ImagePipelineConfig
import com.facebook.imagepipeline.memory.PoolConfig
import com.facebook.imagepipeline.memory.PoolFactory
import com.lynx.service.devtool.LynxDevToolService
import com.lynx.service.http.LynxHttpService
import com.lynx.service.image.LynxImageService
import com.lynx.service.log.LynxLogService
import com.lynx.tasm.LynxEnv
import com.lynx.tasm.service.LynxServiceCenter

class MainApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        initLynxService()
        initLynxEnv()
    }

    private fun initLynxService() {
        // Init Fresco which is needed by LynxImageService
        val factory = PoolFactory(PoolConfig.newBuilder().build())
        val builder = ImagePipelineConfig.newBuilder(applicationContext).setPoolFactory(factory)
        Fresco.initialize(applicationContext, builder.build())

        LynxServiceCenter.inst().registerService(LynxImageService.getInstance())
        LynxServiceCenter.inst().registerService(LynxLogService)
        LynxServiceCenter.inst().registerService(LynxHttpService)
        // For debug mode, you can enable LynxDevToolService to debug the lynx page.
        if (BuildConfig.DEBUG) {
            LynxServiceCenter.inst().registerService(LynxDevToolService)
        }
    }

    /**
     * Initialize the Lynx environment.
     *
     * @param appContext The context object for the application lifecycle.
     * @param libraryLoader The loader for native so files, the default value can be null, which will use the system default loader.
     * @param templateProvider The global AppBundle loader, the default value can be null.
     * @param behaviorBundle The list of custom components, the default value can be null. If there are customization requirements, please refer to custom-native-component
     */
    private fun initLynxEnv() {
        LynxEnv.inst().init(
            this, // appContext
            null, // libraryLoader
            null, // templateProvider
            null  // behaviorBundle
        )
        if(BuildConfig.DEBUG){
            Log.d("MainApplication", if (BuildConfig.DEBUG) "This is a debug build." else "This is a release build.")
            // Enable Lynx Debug
            LynxEnv.inst().enableLynxDebug(true)
            // Enable Lynx DevTool
            LynxEnv.inst().enableDevtool(true)
            // Enable Lynx LogBox
            LynxEnv.inst().enableLogBox(true)
        }
    }

}

/**
 * MainApplication is the entry point of the application.
 * It initializes the LynxServiceCenter with necessary services like image, log, and http.
 */
