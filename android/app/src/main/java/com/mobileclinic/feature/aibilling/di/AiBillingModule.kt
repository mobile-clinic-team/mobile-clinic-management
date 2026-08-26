package com.mobileclinic.feature.aibilling.di

import com.mobileclinic.feature.aibilling.data.remote.AiBillingApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AiBillingModule {

    @Provides
    @Singleton
    fun provideAiBillingApi(retrofit: Retrofit): AiBillingApi {
        return retrofit.create(AiBillingApi::class.java)
    }
}
