package com.mobileclinic.feature.patient.di

import com.mobileclinic.feature.patient.data.remote.PatientIdentityApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object PatientIdentityModule {

    @Provides
    @Singleton
    fun providePatientIdentityApi(retrofit: Retrofit): PatientIdentityApi {
        return retrofit.create(PatientIdentityApi::class.java)
    }
}
