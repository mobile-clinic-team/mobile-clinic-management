package com.mobileclinic.feature.doctorops.di

import com.mobileclinic.feature.doctorops.data.remote.DoctorOpsApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DoctorOpsModule {

    @Provides
    @Singleton
    fun provideDoctorOpsApi(retrofit: Retrofit): DoctorOpsApi {
        return retrofit.create(DoctorOpsApi::class.java)
    }
}
