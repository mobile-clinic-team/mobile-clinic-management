package com.mobileclinic.feature.clinical.di

import com.mobileclinic.feature.clinical.data.remote.ClinicalApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object ClinicalModule {

    @Provides
    @Singleton
    fun provideClinicalApi(retrofit: Retrofit): ClinicalApi {
        return retrofit.create(ClinicalApi::class.java)
    }
}
