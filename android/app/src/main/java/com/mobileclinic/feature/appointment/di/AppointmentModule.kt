package com.mobileclinic.feature.appointment.di

import com.mobileclinic.feature.appointment.data.remote.AppointmentApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppointmentModule {

    @Provides
    @Singleton
    fun provideAppointmentApi(retrofit: Retrofit): AppointmentApi {
        return retrofit.create(AppointmentApi::class.java)
    }
}
